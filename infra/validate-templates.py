"""Validate local CloudFormation and both staged shared-stack variants offline."""

import subprocess
import tempfile
from pathlib import Path

import yaml


class Loader(yaml.SafeLoader):
    pass


def intrinsic(loader, tag, node):
    if isinstance(node, yaml.ScalarNode):
        value = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node)
    else:
        value = loader.construct_mapping(node)

    if tag == "GetAtt" and isinstance(value, str):
        value = value.split(".", 1)

    return {tag if tag == "Ref" else f"Fn::{tag}": value}


Loader.add_multi_constructor("!", intrinsic)


def validate() -> None:
    root = Path(__file__).resolve().parents[1]
    shared = (root / "infra/shared/serverless.yml").read_text()
    with tempfile.TemporaryDirectory() as directory:
        paths = []
        for stage in ["dev", "prod"]:
            text = shared.replace("${self:provider.stage}", stage)
            text = text.replace("${param:webOrigin}", "https://papert.example.com")
            text = text.replace(
                "${param:alarmTopicArn}",
                "arn:aws:sns:us-east-1:123456789012:papert-alerts",
            )
            template = yaml.load(text, Loader=Loader)["resources"]
            path = Path(directory) / f"{stage}.yaml"
            path.write_text(yaml.safe_dump(template))
            paths.append(str(path))

        paths.extend(
            str(root / f"infra/shared/{name}.yaml")
            for name in ["chat", "ingestion", "sessions", "storage"]
        )
        subprocess.run(
            ["cfn-lint", "--non-zero-exit-code", "error", "--template", *paths],
            check=True,
        )


if __name__ == "__main__":
    validate()
