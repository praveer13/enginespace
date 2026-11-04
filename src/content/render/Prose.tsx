import type { ProseFlow, ProseInline } from '@es/schema'
import { TextLink } from '@/design/components/TextLink'
import { ClaimChip } from './ClaimChip'
import './content.css'
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
  return nodes.map((node, at) => <Span key={at} node={node} env={env} />)
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
      return <ClaimChip id={node.id} env={env} />
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
