/*
 * Back of House's notional-machine card, on the page (A§5.9, D-012): what the lifecycle model draws, what it leaves out and what it was
 * checked against. The full card is content/cards/lifecycle.md, which cites a claim for every engine fact. This is the same card in the
 * words of the page; it holds no number that lacks a source, because the model's own facts live in the stages and their citations.
 */
export function WorldCard() {
  return (
    <div className="flex flex-col gap-3" data-floor-card="">
      <p>
        <strong>Models.</strong> One request&apos;s path through an engine, as a list of stages. Each stage has a place (a process, a thread and a device) and a
        mechanism: work in place, a queue, IPC, shared memory, a copy, a launch, a collective or a sync. A stage starts where the one before it ended, and its
        mechanism is the way it crosses the boundary between its two places: a queue between threads, IPC or shared memory between processes, a copy or a
        launch between the host and a GPU. After a copy to the host the value is not there yet, so nothing reads it before a sync. Each stage cites its file,
        its symbol and a line at the commit the course pins for the engine.
      </p>
      <p>
        <strong>Ignores.</strong> How long a stage takes: the model keeps the order of the stages and says nothing about time. Other requests in the batch, the
        loop&apos;s repetition for each token, and every failure but a client that leaves mid-stream. The several small copies of one step are one copy, and a
        host call that only starts work on the GPU is not a stage.
      </p>
      <p>
        <strong>Calibrated against.</strong> The pinned source, stage by stage: the stages were read against their files at their commits when the model was
        written, and a test checks each citation against the unpacked source when it is given one. Nothing yet against a captured trace: until the owner&apos;s
        traces arrive, every lifecycle trace the site shows is synthetic. The real engine is the judge.
      </p>
    </div>
  )
}
