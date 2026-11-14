import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { packs, validatePacks } from "./prepare-type-packs.mjs";

const smokePrograms = {
  node: 'import { readFile } from "node:fs"; readFile;',
  react:
    'import { useState } from "react"; import { createRoot } from "react-dom/client"; useState; createRoot;',
  next: 'import type { NextRequest } from "next/server"; let request: NextRequest; request!;',
  express:
    'import express from "express"; express().get("/", (req, res) => res.send(req.path));',
  fastify:
    'import fastify from "fastify"; fastify().get("/", async () => "ok");',
  hono: 'import { Hono } from "hono"; new Hono().get("/", c => c.text("ok"));',
  koa: 'import Koa from "koa"; new Koa().use(async ctx => { ctx.body = "ok"; });',
  nestjs:
    'import { Controller, Body } from "@nestjs/common"; import { NestFactory } from "@nestjs/core"; import { ConfigModule } from "@nestjs/config"; Controller; Body; NestFactory; ConfigModule;',
  "class-validator":
    'import { IsEmail } from "class-validator"; import { plainToInstance } from "class-transformer"; IsEmail; plainToInstance;',
  zod: 'import { z } from "zod"; z.string().parse("ok");',
  "drizzle-orm":
    'import { eq } from "drizzle-orm"; import { pgTable, text } from "drizzle-orm/pg-core"; pgTable("users", { name: text() }); eq;',
  typeorm: 'import { Entity, DataSource } from "typeorm"; Entity; DataSource;',
  mongoose:
    'import { Schema, model } from "mongoose"; model("User", new Schema({ name: String }));',
  trpc: 'import { initTRPC } from "@trpc/server"; import { createTRPCClient } from "@trpc/client"; initTRPC.create(); createTRPCClient;',
  langchain:
    'import { createAgent } from "langchain"; import { ChatOpenAI } from "@langchain/openai"; import { ChatAnthropic } from "@langchain/anthropic"; import { StateGraph } from "@langchain/langgraph"; createAgent; ChatOpenAI; ChatAnthropic; StateGraph;',
  ai: 'import { generateText } from "ai"; generateText;',
  openai:
    'import OpenAI from "openai"; new OpenAI({ apiKey: "test" }).chat.completions.create;',
  anthropic:
    'import Anthropic from "@anthropic-ai/sdk"; new Anthropic({ apiKey: "test" }).messages.create;',
  axios: 'import axios from "axios"; axios.get("/");',
  vitest:
    'import { describe, it, expect } from "vitest"; describe("test", () => it("works", () => expect(1).toBe(1)));',
  jest: 'describe("test", () => it("works", () => expect(1).toBe(1)));',
  supertest:
    'import request from "supertest"; request("http://localhost").get("/").expect(200);',
};

function smokeCheck(id, manifest, output) {
  const files = new Map();
  const loaded = new Set();

  function load(packId) {
    if (loaded.has(packId)) {
      return;
    }

    loaded.add(packId);
    for (const dependency of manifest.packs[packId].requires) {
      load(dependency);
    }

    for (const [uri, content] of Object.entries(output[packId].files)) {
      files.set(fileURLToPath(uri), content);
    }
  }

  load(id);
  files.set("/entry.mts", smokePrograms[id]);

  const options = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: id === "jest" ? ["jest"] : ["node"].filter(() => loaded.has("node")),
    typeRoots: ["/node_modules/@types"],
    esModuleInterop: true,
    skipLibCheck: false,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile;
  const libDirectory = path.dirname(ts.getDefaultLibFilePath(options));
  host.readFile = (file) =>
    files.get(path.resolve(file)) ??
    (file.startsWith(`${libDirectory}/`) ? originalRead(file) : undefined);
  host.fileExists = (file) =>
    files.has(path.resolve(file)) ||
    (file.startsWith(`${libDirectory}/`) && ts.sys.fileExists(file));
  host.directoryExists = (directory) =>
    [...files.keys()].some((file) =>
      file.startsWith(`${path.resolve(directory)}/`),
    ) || directory === libDirectory;
  host.getCurrentDirectory = () => "/";
  host.realpath = (file) => path.resolve(file);
  host.getSourceFile = (file, languageVersion) => {
    const content = host.readFile(file);

    return content === undefined
      ? undefined
      : ts.createSourceFile(file, content, languageVersion);
  };

  const ambientFiles = [...files]
    .filter(([file, content]) => {
      if (!/\.d\.[cm]?ts$/.test(file)) {
        return false;
      }

      const source = ts.createSourceFile(file, content, options.target);

      return !ts.isExternalModule(source);
    })
    .map(([file]) => file);
  const program = ts.createProgram(
    ["/entry.mts", ...ambientFiles],
    options,
    host,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const failures = diagnostics.filter(
    (diagnostic) =>
      [2307, 2688, 7016, 2792].includes(diagnostic.code) ||
      diagnostic.code < 2000 ||
      diagnostic.file?.fileName === "/entry.mts",
  );
  const messages = ts.formatDiagnosticsWithColorAndContext(failures, host);

  assert.equal(failures.length, 0, `${id}: ${messages}`);
}

test("generated packs satisfy the contract and resolve framework imports in an isolated virtual filesystem", () => {
  const directory = new URL("../public/type-packs/", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", directory), "utf8"),
  );
  const output = Object.fromEntries(
    Object.entries(manifest.packs).map(([id, entry]) => [
      id,
      JSON.parse(readFileSync(new URL(entry.file, directory), "utf8")),
    ]),
  );

  validatePacks({ manifest, output });

  for (const id of Object.keys(packs)) {
    smokeCheck(id, manifest, output);
  }
});

