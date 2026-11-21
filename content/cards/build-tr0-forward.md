---
id: build-tr0-forward
kind: build-this
title: Qwen3-0.6B's forward pass, written in PyTorch on your laptop
lab: tr0.forward
stages: [s1, s2, s3]
status: review
---

You write the forward pass that this lesson reads: the layer's order, the sizes from the configuration, the shapes at five points, and then the cache. It runs on your laptop's CPU in `float32`, and a grader there compares your logits with Hugging Face's `transformers`. The course has built the lab and has not yet run it on the pinned weights.
