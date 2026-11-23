/*
 * What a lab is called, in the engine's own words: the heading of its page, its tab and its served document, and the link to it from
 * a lesson. Kept in a file of its own, with no import, so that a page that only names a lab (src/content/render/model.ts, the build's page
 * plan) does not carry the lab's host and oracle. src/forge/labs.ts reads its titles from here, and tests/forge/labs.test.ts holds the two together. A graded lab's page takes its title from here too (src/labs/published.ts), and tests/labs/descriptors.test.ts holds the two together.
 */
export const LAB_TITLES: Readonly<Record<string, string>> = {
  toy: 'Build an LRU free queue',
  'rejection-sampler': 'Build the rejection sampler',
  'hybrid-kv': 'Build a hybrid KV cache manager',
  'tr0.forward': 'Build the Qwen3-0.6B forward pass on a CPU',
}
