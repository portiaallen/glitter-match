# Laboratory board fixtures

These JSON documents are **engine test fixtures only**.

They are not campaign levels. They have no level numbers, no Land assignment, no story, and no player rewards.

Each file is a `BoardDocument`:

- `shape` is an optional human label. The matching engine never reads it.
- `cells` and `connections` are the graph. Coordinates are layout.
- `topology.kind` is authoring vocabulary, not a special-case engine.

A future designer can add a completely new shape by authoring another document like these — without changing the core matcher.

These files must not become production Level DNA automatically. The content validator rejects `lab.*` ids and `data/lab/` paths under the production profile.
