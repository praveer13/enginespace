import { Link } from 'react-router'

// Statically imported by the route table: ARCHITECTURE §3.1 keeps the not-found page in the entry chunk.
export function Component() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        Nothing lives at this address. Go to the{' '}
        <Link to="/" className="underline">
          front page
        </Link>
        .
      </p>
    </>
  )
}
