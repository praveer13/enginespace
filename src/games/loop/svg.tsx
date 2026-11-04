import { createElement, type ReactNode } from 'react'
import type { SvgNode } from '@es/play/loop/svg'

/**
 * The 2D view's drawing as React elements. `packages/play/loop/layout.ts` lays the night out and `frameSvg` writes it as a tree of
 * nodes; the poster is that tree as text (scripts/posters.ts) and this is the same tree as elements, so the two are one drawing.
 * Attribute names in the tree are React's own, so they pass through as props. tests/play/loop-layout.test.ts requires the markup of
 * the two to be identical.
 */
export function svgToReact(node: SvgNode, key?: number): ReactNode {
  return createElement(node.tag, { key, ...node.attrs }, ...(node.children ?? []).map((child, index) => (typeof child === 'string' ? child : svgToReact(child, index))))
}
