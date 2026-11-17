import type { ReactNode } from 'react'
import type { ProseFlow, ProseInline } from '@es/schema'
import { TextLink } from '@/design/components/TextLink'
import { kernelspaceLabel, kernelspaceUrl, plainText, type RenderEnv } from './model'
import { TagChip } from './TagChip'

/*
 * Prose is a restricted token tree (ARCHITECTURE §4.1, D-016): paragraph, heading, list, table and code at block level,
 * and text, emphasis, a code span, a link, a claim and a tag inside a line. React renders the tree. No node holds markup,
 * so text is always text: it reaches the page as a string child, which React escapes, and never as HTML.
 *
 * `Prose` returns the flows with no wrapper of its own, so a ticket's body lays them out. A level-2 heading is normally the
 * stamped title of a ticket (Blocks), and is drawn here as an `h2` only when prose is rendered on its own.
 */

/** A run of prose flows. */
export function Prose({ body, env }: { body: readonly ProseFlow[]; env: RenderEnv }) {
  return body.map((node, at) => <Flow key={at} node={node} env={env} />)
}

/** A line of prose: its text, emphasis, code, links, claims and tags. */
export function Inline({ nodes, env }: { nodes: readonly ProseInline[]; env: RenderEnv }) {
  if (env.marks !== undefined) return <Marked nodes={nodes} env={env} />
  return nodes.map((node, at) => <Span key={at} node={node} env={env} />)
}

/** The last number in a run of text, with what comes before and after it: what a tag that follows the text is about. */
const LAST_NUMBER = /^([\s\S]*?)(\d(?:[\d,.]*\d)?%?)(\D*)$/
/** Text that ends a sentence: a claim after it is the sentence's source. */
const SENTENCE_END = /[.!?:;]['")]*\s*$/
/** The last word of a run of text, which a claim's mark is kept on one line with. */
const LAST_WORD = /^([\s\S]*?)(\S+)\s*$/

/**
 * A line on a lesson page (REDESIGN §2.5, P6): a claim is a numbered mark kept on one line with the word before it, and a tag is no chip:
 * the number it follows carries a dotted underline and the tag as hidden text, and it is not a tab stop.
 */
function Marked({ nodes, env }: { nodes: readonly ProseInline[]; env: RenderEnv }) {
  const out: ReactNode[] = []
  nodes.forEach((node, at) => {
    const next = nodes[at + 1]
    const prev = nodes[at - 1]
    if (node.type === 'text' && next?.type === 'tag') {
      // "window [estimated]." keeps no space before its stop once the tag is hidden.
      const tight = nodes[at + 2]?.type === 'text' && /^[.,;:)]/.test((nodes[at + 2] as { text: string }).text)
      const match = LAST_NUMBER.exec(node.text)
      if (match === null) out.push(tight ? node.text.trimEnd() : node.text, <span key={`t${at}`} className="sr-only">{` (${next.tag})`}</span>)
      else
        out.push(
          match[1],
          <span key={`n${at}`} className="es-num" data-tag={next.tag}>
            {match[2]}
            <span className="sr-only">{` (${next.tag})`}</span>
          </span>,
          tight ? match[3].trimEnd() : match[3],
        )
      return
    }
    // A claim after a full stop is the source of the sentence before it: its mark alone. Anywhere else it is a value in the sentence.
    if (node.type === 'text' && next?.type === 'claim' && SENTENCE_END.test(node.text)) {
      const match = LAST_WORD.exec(node.text)
      if (match !== null) {
        out.push(
          match[1],
          <span key={`w${at}`} className="es-claimed">
            {match[2]}
            {env.claim?.(next.id, false)}
          </span>,
        )
        return
      }
    }
    if (node.type === 'tag') {
      if (prev?.type !== 'text') out.push(<span key={at} className="sr-only">{` (${node.tag})`}</span>)
      return
    }
    if (node.type === 'claim') {
      if (prev?.type === 'text' && SENTENCE_END.test(prev.text) && LAST_WORD.test(prev.text)) return
      // A claim that follows another claim's mark, with only a space between, is a second source of the same sentence: a mark too, and never
      // its value set loose after the stop (the walks' trip: "...once the data is there. 1 a copy between the CPU and the GPU synchronizes 2").
      const before = prev?.type === 'text' && /^\s*$/.test(prev.text) ? nodes[at - 2] : prev
      if (before?.type === 'claim') {
        out.push(
          <span key={at} className="es-claimchain">
            {env.claim?.(node.id, false)}
          </span>,
        )
        return
      }
      out.push(<span key={at}>{env.claim?.(node.id, true)}</span>)
      return
    }
    out.push(<Span key={at} node={node} env={env} />)
  })
  return out
}

function Flow({ node, env }: { node: ProseFlow; env: RenderEnv }) {
  switch (node.type) {
    case 'paragraph':
      return (
        <p>
          <Inline nodes={node.children} env={env} />
        </p>
      )
    case 'heading': {
      const Heading = `h${node.depth}` as const
      return (
        <Heading id={env.headings.get(node)}>
          <Inline nodes={node.children} env={env} />
        </Heading>
      )
    }
    case 'list': {
      const items = node.items.map((item, at) => (
        <li key={at}>
          <ListItem flows={item} env={env} />
        </li>
      ))
      return node.ordered ? <ol start={node.start}>{items}</ol> : <ul>{items}</ul>
    }
    case 'table':
      return <Table node={node} env={env} />
    case 'code':
      // A code block can be wider than the page, so it scrolls, and a scroller must be reachable by keyboard.
      return (
        <pre tabIndex={0} data-lang={node.lang}>
          <code>{node.text}</code>
        </pre>
      )
  }
}

/** A list item. A lone paragraph, with or without lists under it, is the item's own text and not a paragraph inside it. */
function ListItem({ flows, env }: { flows: readonly ProseFlow[]; env: RenderEnv }) {
  const [first, ...rest] = flows
  if (first?.type === 'paragraph' && rest.every((flow) => flow.type === 'list')) {
    return (
      <>
        <Inline nodes={first.children} env={env} />
        <Prose body={rest} env={env} />
      </>
    )
  }
  return <Prose body={flows} env={env} />
}

function Table({ node, env }: { node: Extract<ProseFlow, { type: 'table' }>; env: RenderEnv }) {
  const columns = node.head.map((cell) => plainText(cell)).filter((text) => text !== '')
  return (
    // The wrapper scrolls sideways on a narrow screen. A group with a name is reachable by keyboard and says what it holds.
    <div className="es-table" role="group" tabIndex={0} aria-label={columns.length > 0 ? `Table: ${columns.join(', ')}` : 'Table'}>
      <table>
        <thead>
          <tr>
            {node.head.map((cell, at) => (
              <th key={at} scope="col" data-align={node.align[at] ?? undefined}>
                <Inline nodes={cell} env={env} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row, at) => (
            <tr key={at}>
              {row.map((cell, column) => (
                <td key={column} data-align={node.align[column] ?? undefined}>
                  <Inline nodes={cell} env={env} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Span({ node, env }: { node: ProseInline; env: RenderEnv }) {
  switch (node.type) {
    case 'text':
      return node.text
    case 'em':
      return (
        <em>
          <Inline nodes={node.children} env={env} />
        </em>
      )
    case 'strong':
      return (
        <strong>
          <Inline nodes={node.children} env={env} />
        </strong>
      )
    case 'code':
      return <code>{node.text}</code>
    case 'link':
      return <Href href={node.href} nodes={node.children} env={env} />
    case 'claim':
      return env.claim === undefined ? <code data-claim={node.id}>{node.id}</code> : env.claim(node.id)
    case 'tag':
      return <TagChip tag={node.tag} />
    case 'ks': {
      // A kernelspace lesson links out to kernelspace's site. A KC has no page there, so it is named and not linked.
      const url = kernelspaceUrl(node.ref)
      return (
        <span className="es-ks">
          {url === null ? kernelspaceLabel(node.ref) : <TextLink href={url}>{kernelspaceLabel(node.ref)}</TextLink>}
        </span>
      )
    }
  }
}

/**
 * The schema lets a link go three places (PROSE_HREF): another site over https, a route of this one, or an anchor on this
 * page. The first opens in a new tab and says so, the second is the router's, and the third is the browser's own jump.
 */
function Href({ href, nodes, env }: { href: string; nodes: readonly ProseInline[]; env: RenderEnv }) {
  const label = <Inline nodes={nodes} env={env} />
  if (href.startsWith('https://')) return <TextLink href={href}>{label}</TextLink>
  if (href.startsWith('#')) return <a href={href}>{label}</a>
  return <TextLink to={href}>{label}</TextLink>
}
