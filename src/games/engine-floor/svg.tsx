import { createElement, type CSSProperties, type ReactNode } from 'react'
import type { SvgNode } from '@es/play/loop/svg'

/*
 * The drawing's tree as React elements. packages/play/engine-floor/layout.ts lays the house out and `frameSvg` writes it as a tree of
 * nodes whose attribute names are React's own. Two things differ from the front page's drawing (src/games/loop/svg.tsx): a node may carry
 * `style` as CSS text, which React wants as an object, and a run's new stops can be marked to be inked in, one after another.
 */

/** CSS text as the object React takes: `animation-delay: 2s` is `{ animationDelay: '2s' }`, and a custom property keeps its name. */
export function styleOf(text: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const declaration of text.split(';')) {
    const at = declaration.indexOf(':')
    if (at < 0) continue
    const name = declaration.slice(0, at).trim()
    out[name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = declaration.slice(at + 1).trim()
  }
  return out as CSSProperties
}

export function svgToReact(node: SvgNode, key?: number): ReactNode {
  const { style, ...attrs } = node.attrs
  return createElement(
    node.tag,
    { key, ...attrs, ...(typeof style === 'string' ? { style: styleOf(style) } : {}) },
    ...(node.children ?? []).map((child, index) => (typeof child === 'string' ? child : svgToReact(child, index))),
  )
}

/**
 * The tree with the stops of the stages from `from` up to `to` marked to be inked in. Each takes the printer's stepped feed, and starts one
 * quick beat after the stop before it: the delay is a multiple of the quick duration, so under reduced motion, where every duration is 0,
 * the stops are there at once.
 */
export function inkIn(node: SvgNode, from: number, to: number): SvgNode {
  const stage = node.attrs['data-stage']
  const fresh = typeof stage === 'number' && stage >= from && stage < to
  return {
    ...node,
    attrs: fresh ? { ...node.attrs, className: 'es-floor-ink', style: `animation-delay: calc(var(--es-dur-quick) * ${stage - from})` } : node.attrs,
    children: node.children?.map((child) => (typeof child === 'string' ? child : inkIn(child, from, to))),
  }
}
