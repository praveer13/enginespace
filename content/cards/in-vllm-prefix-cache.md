---
id: in-vllm-prefix-cache
kind: in-production
title: Prefix caching
status: draft
---

A request that starts with tokens the engine has already computed reads their keys and values from the page pool and computes only the rest. The engines turn the lever on by default.

## vLLM

- **The flag.** Prefix caching is a field of the cache config, and it is on until you turn it off. {{claim:vllm.cache.prefix-caching-default}}
- **The page.** A cached block holds {{claim:vllm.cache.block-size-default}} by default, so a prefix is reused in whole blocks.

## SGLang

- **The tree.** Cached prefixes live in a radix tree, and its core is chosen by an environment variable. The Rust core is the default. {{claim:sglang.radix.rust-core-default}}
