"""Offline deployment contracts; run with PyYAML and Python's unittest runner."""

import importlib.util
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

ROOT = Path(__file__).resolve().parents[2]


class Loader(yaml.SafeLoader):
    pass


def intrinsic(loader, tag, node):
    if isinstance(node, yaml.ScalarNode):
        return {tag: loader.construct_scalar(node)}
    if isinstance(node, yaml.SequenceNode):
        return {tag: loader.construct_sequence(node)}
    return {tag: loader.construct_mapping(node)}


Loader.add_multi_constructor("!", intrinsic)


def load(path):
    return yaml.load((ROOT / path).read_text(), Loader=Loader)


def module(path):
    spec = importlib.util.spec_from_file_location("infra_module", ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class InfrastructureContracts(unittest.TestCase):
    def test_queue_contracts(self):
        resources = load("infra/shared/serverless.yml")["resources"]["Resources"]
        for app, worker, queue in [
            ("seymour", "worker", "Chat"),
            ("ingestion", "ingest", "Ingestion"),
            ("core", "resultsConsumer", "Results"),
        ]:
            config = load(f"apps/{app}/serverless.yml")
            function = config["functions"][worker]
            timeout = function.get("timeout", config["provider"]["timeout"])
            properties = resources[f"{queue}Queue"]["Properties"]
            self.assertGreaterEqual(properties["VisibilityTimeout"], timeout * 6)
            self.assertEqual(properties["RedrivePolicy"]["maxReceiveCount"], 3)
            self.assertGreater(
                resources[f"{queue}DLQ"]["Properties"]["MessageRetentionPeriod"],
                properties["MessageRetentionPeriod"],
            )
            event = function["events"][0]["sqs"]
            self.assertEqual(event["maximumConcurrency"], 2)
            self.assertGreaterEqual(
                function["reservedConcurrency"], event["maximumConcurrency"]
            )
            self.assertEqual(
                event["arn"],
                {
                    "ImportValue": f"papert-shared-{queue}QueueArn-${{self:provider.stage}}"
                },
            )

    def test_local_queue_settings_match_cloud(self):
        resources = load("infra/shared/serverless.yml")["resources"]["Resources"]
        for name, file in [
            ("Chat", "chat"),
            ("Results", "chat"),
            ("Ingestion", "ingestion"),
        ]:
            local = load(f"infra/shared/{file}.yaml")["Resources"][f"{name}Queue"][
                "Properties"
            ]
            cloud = resources[f"{name}Queue"]["Properties"]
            for key in ["VisibilityTimeout", "MessageRetentionPeriod"]:
                self.assertEqual(local[key], cloud[key])

    def test_stages_have_disjoint_names_and_exports(self):
        template = load("infra/shared/serverless.yml")["resources"]
        names = []
        for resource in template["Resources"].values():
            properties = resource.get("Properties", {})
            for key in ["QueueName", "BucketName", "TableName"]:
                if key in properties:
                    names.append(str(properties[key]))
        names.extend(
            str(output["Export"]["Name"]) for output in template["Outputs"].values()
        )

        dev = {name.replace("${self:provider.stage}", "dev") for name in names}
        prod = {name.replace("${self:provider.stage}", "prod") for name in names}

        self.assertFalse(dev & prod)

    def test_storage_and_ttl(self):
        resources = load("infra/shared/serverless.yml")["resources"]["Resources"]
        bucket = resources["SourcesBucket"]
        self.assertEqual(bucket["DependsOn"], "IngestionQueuePolicy")
        self.assertEqual(bucket["DeletionPolicy"], "Retain")
        properties = bucket["Properties"]
        self.assertIn("${AWS::AccountId}", properties["BucketName"]["Sub"])
        self.assertIn("${self:provider.stage}", properties["BucketName"]["Sub"])
        events = properties["NotificationConfiguration"]["QueueConfigurations"]
        self.assertEqual(
            {event["Event"] for event in events},
            {"s3:ObjectCreated:*", "s3:ObjectRemoved:*"},
        )
        self.assertTrue(all(properties["PublicAccessBlockConfiguration"].values()))
        self.assertEqual(
            resources["SessionsTable"]["Properties"]["TimeToLiveSpecification"],
            {"AttributeName": "expires", "Enabled": True},
        )

    def test_images_and_secrets(self):
        for app in ["core", "seymour", "ingestion"]:
            config = load(f"apps/{app}/serverless.yml")
            self.assertNotIn("package", config)
            for function in config["functions"].values():
                self.assertEqual(function["image"]["name"], "runtime")
            environment = config["provider"]["environment"]
            for key in ["DATABASE_URL", "SEYMOUR_DATABASE_URL", "OPENAI_API_KEY"]:
                if key in environment:
                    self.assertNotIn(", ''", environment[key])
            dockerfile = (ROOT / f"apps/{app}/Dockerfile.lambda").read_text()
            self.assertIn("USER ", dockerfile)
            self.assertIn("@sha256:", dockerfile)

    def test_compose_readiness_and_migrations(self):
        services = load("compose.yaml")["services"]
        for app in ["core", "seymour"]:
            self.assertIn("ok", str(services[app]["healthcheck"]["test"]))
            self.assertIn(f"{app}-migrate", services)
            self.assertNotIn(
                "migrate",
                (ROOT / f"apps/{app}/Dockerfile").read_text().split("CMD ")[1],
            )

    def test_web_ingress_and_edge_secret_boundary(self):
        services = load("compose.yaml")["services"]
        web = services["web"]
        ingress = services["ingress"]
        core = load("apps/core/serverless.yml")

        self.assertNotIn("ports", web)
        self.assertIn("@sha256:", ingress["image"])
        self.assertEqual(ingress["ports"], ["127.0.0.1:3000:80"])
        self.assertEqual(web["environment"]["TRUSTED_PROXY_COUNT"], "1")
        self.assertEqual(
            web["environment"]["EDGE_PROXY_SECRET"],
            services["core"]["environment"]["EDGE_PROXY_SECRET"],
        )
        self.assertIn(
            "/aws/reference/secretsmanager/",
            core["provider"]["environment"]["EDGE_PROXY_SECRET"],
        )
        config = (ROOT / "infra/ingress/default.conf").read_text()
        self.assertIn("proxy_set_header X-Forwarded-For $remote_addr;", config)
        self.assertIn('proxy_set_header X-Papert-Edge "";', config)
        self.assertNotIn("$proxy_add_x_forwarded_for", config)
        overlay = load("compose.e2e.yaml")["services"]
        self.assertNotIn("web", overlay)
        self.assertEqual(
            overlay["ingress"]["ports"],
            {"override": ["127.0.0.1:${E2E_WEB_PORT:-3100}:80"]},
        )

    def test_edge_secret_setup_preserves_existing_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "Makefile").write_text((ROOT / "Makefile").read_text())
            env = path / ".env"
            env.write_text("AUTH_JWE_KEYS=existing-key-map\n")

            for target, filename in [("auth-env", ".env"), ("e2e-env", ".env.e2e")]:
                subprocess.run(
                    ["make", target], cwd=path, check=True, capture_output=True
                )
                first = (path / filename).read_text()
                subprocess.run(
                    ["make", target], cwd=path, check=True, capture_output=True
                )

                self.assertEqual((path / filename).read_text(), first)
                self.assertRegex(first, r"EDGE_PROXY_SECRET=[0-9a-f]{64}\n")
            self.assertIn("AUTH_JWE_KEYS=existing-key-map\n", env.read_text())

    def test_auth_gateway_and_log_alerts(self):
        core = load("apps/core/serverless.yml")
        self.assertEqual(core["provider"]["environment"]["TRUST_PROXY_HOPS"], "2")
        services = load("compose.yaml")["services"]
        self.assertEqual(
            services["core"]["environment"]["TRUST_PROXY_HOPS"],
            "${TRUST_PROXY_HOPS:-1}",
        )
        stage = core["resources"]["extensions"]["HttpApiStage"]["Properties"]
        self.assertEqual(
            stage["RouteSettings"]["ANY /auth/{proxy+}"]["ThrottlingRateLimit"], 2
        )
        patterns = {
            resource["Properties"]["FilterPattern"]
            for resource in core["resources"]["Resources"].values()
            if resource["Type"] == "AWS::Logs::MetricFilter"
        }
        for event in ["auth.sign_in_failed", "auth.rate_limited", "auth.refresh_reuse"]:
            matching = [
                pattern
                for pattern in patterns
                if re.search(pattern.strip("%"), '{"securityEvent":"' + event + '"}')
            ]
            self.assertEqual(len(matching), 1)
            self.assertNotIn('"', matching[0])
            self.assertIsNotNone(
                re.search(
                    matching[0].strip("%"),
                    '2026-11-10T00:00:00Z request-id WARN {"securityEvent":"'
                    + event
                    + '"}',
                )
            )

    def test_evaluation_gates_are_capped_and_skip_missing_secrets(self):
        steps = load(".github/workflows/ci.yml")["jobs"]["backend"]["steps"]
        commands = "\n".join(step.get("run", "") for step in steps)
        self.assertIn("-r apps/seymour/requirements-dev.txt", commands)
        self.assertIn("pyright", commands)
        self.assertIn("python -m evals.ci --offline", commands)
        paid = load(".github/workflows/evaluations.yml")["jobs"]["evaluate"]
        self.assertEqual(paid["env"]["EVAL_SPEND_CAP_USD"], "0.25")
        evaluate = next(
            step for step in paid["steps"] if step.get("run") == "python -m evals.ci"
        )
        self.assertEqual(evaluate["if"], "steps.credentials.outputs.ready == 'true'")
        self.assertEqual(
            set(evaluate["env"]),
            {
                "OPENAI_API_KEY",
                "LANGFUSE_BASE_URL",
                "LANGFUSE_PUBLIC_KEY",
                "LANGFUSE_SECRET_KEY",
            },
        )

    def test_blank_templates_fail_without_modification(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("POSTGRES_PASSWORD=\n")
            with self.assertRaises(ValueError):
                module("infra/preflight.py").validate(path)
            self.assertEqual(path.read_text(), "POSTGRES_PASSWORD=\n")

            path.write_text("LF_SALT=\n")
            with self.assertRaises(ValueError):
                module("infra/langfuse/setup.py").prepare(path)
            self.assertEqual(path.read_text(), "LF_SALT=\n")

    def test_preflight_rejects_invalid_auth_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            passwords = "".join(
                f"{key}=valid-password-123456\n"
                for key in [
                    "POSTGRES_PASSWORD",
                    "CORE_DB_PASSWORD",
                    "SEYMOUR_DB_PASSWORD",
                ]
            )
            for auth in [
                "AUTH_JWE_KEYS=\n",
                'AUTH_JWE_KEYS={"key":"invalid"}\nAUTH_JWE_ACTIVE_KID=key\n',
            ]:
                path.write_text(passwords + auth)
                with self.assertRaises(ValueError):
                    module("infra/preflight.py").validate(path)

            path.write_text(
                passwords
                + 'AUTH_JWE_KEYS={"key":"'
                + "ab" * 32
                + '"}\nAUTH_JWE_ACTIVE_KID=key\n'
            )
            module("infra/preflight.py").validate(path)

    def test_langfuse_setup_preserves_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.langfuse"
            setup = module("infra/langfuse/setup.py")
            setup.prepare(path)
            first = path.read_text()
            setup.prepare(path)
            self.assertEqual(path.read_text(), first)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_smoke_only_deletes_disposable_queues(self):
        smoke = module("infra/shared/smoke-queue.py")
        with patch.object(smoke.boto3, "client") as factory:
            client = factory.return_value
            client.create_queue.side_effect = [
                {"QueueUrl": "dlq"},
                {"QueueUrl": "queue"},
            ]
            client.get_queue_attributes.return_value = {
                "Attributes": {"QueueArn": "arn:dlq"}
            }
            client.send_message.return_value = {"MessageId": "message"}
            client.receive_message.side_effect = [
                {},
                {"Messages": [{"MessageId": "unrelated", "Body": "wrong"}]},
            ]
            with self.assertRaises(AssertionError):
                smoke.main()
            self.assertEqual(
                [
                    call.kwargs["QueueUrl"]
                    for call in client.delete_queue.call_args_list
                ],
                ["queue", "dlq"],
            )
            client.delete_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
