/*
 * The Inspection's notional-machine card, on the page (A§5.9, D-012): what the world models, what it ignores and what it was calibrated
 * against. The full card is content/cards/trace-room-bench.md, which names the benchmark model, the coarse server and the tools' source.
 * Every log in it is synthetic, and the screens say so; the real engine and the real tools are the judge.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-bench-card="">
      <p>
        <strong>Models.</strong> A benchmark client that sends a seeded stream of requests to a server and logs what a client logs: when each order was due, when it was sent, when its first
        token and its last arrived. The server is the step loop run coarse, on kernelspace&apos;s S5 card for a 70B model on H100s. Latency is counted from the due time, a percentile is
        read by nearest rank, and an interval on a p99 is a seeded percentile bootstrap. A flaw is one thing a harness did wrong, and the corrected number is the log timed again, the log
        less its warm-up, or the benchmark run again with the flaw taken out.
      </p>
      <p>
        <strong>Ignores.</strong> A real engine and a real network. Tokens reach the client the moment the engine reads them back, with no HTTP in between. The server has no memory limit,
        no preemption and no host cost per step, and a stall and a cold start are stand-ins for what a real server does.
      </p>
      <p>
        <strong>Calibrated against.</strong> The step-loop model and the S5 card inside its box. Nothing in the client model has been compared with a benchmark of a real engine yet. The
        flaws are the real tools&apos; (<code>vllm bench serve</code> and SGLang&apos;s <code>bench_serving</code>), and each ruling cites its instance with the day it was read.
      </p>
    </div>
  )
}
