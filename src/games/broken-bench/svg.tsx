import { createElement, type ReactNode } from 'react'
import type { SvgNode } from '@es/play/broken-bench/svg'

/**
 * A sheet's drawing as React elements. `packages/play/broken-bench/layout.ts` lays the log out and `sheetSvg` writes it as a tree of nodes;
 * this is the same tree as elements. Attribute names in the tree are React's own, so they pass through as props.
 */
export function svgToReact(node: SvgNode, key?: number): ReactNode {
  return createElement(node.tag, { key, ...node.attrs }, ...(node.children ?? []).map((child, index) => (typeof child === 'string' ? child : svgToReact(child, index))))
}
