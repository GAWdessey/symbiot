# Symbiot to Symbiot sync

Garth works on the same projects (Acme first) from two computers: this one (pop-os,
`/home/odessey`) and a work laptop. GitHub carries the code. This carries Symbiot's own
state, so both installs know the same things and work the same lists.

## What travels, what stays

| Travels | Kept as | Why |
|---|---|---|
| Memory ("What you know", `mind.json` nodes) | one record per fact (name + fact text) | facts are added on both sides; one record each means two machines adding facts to the same name both keep theirs |
| Standing rules (`standing.json`) | one record per rule | |
| Tasks of every lane (`tasks.json`) | one record per task id, each field stamped | a tick on one machine and a reworded task on the other both survive |
| Questions and answers of every lane (`.symbiot/QUESTIONS.md`, `ANSWERS.md`) | one record per lane and file | |
| Answers shared between lanes and asks already answered (`answers-shared.json`, `asks-done.json`) | one record per entry | so neither machine asks again what the other was told |
| The vault's secrets | one record per name, values inside | only ever inside the encrypted file |

| Stays on each machine | Why |
|---|---|
| Agents in progress (`runs.json`, `drafts/`), locks, logs, costs | a run lives on the machine it runs on |
| Folder paths (`config.json` scan roots, `lane-ids.json` paths, `repos.json`) | the same lane is in a different folder on each machine |
| The browser and its sign-ins, the chat log, the vault PIN | personal to the machine, or too big and too live to merge |
| One-use codes in the vault | they expire in minutes and are spent once |

## Lanes on two machines

A git lane's id is its repo's first commit (`laneids.mjs`), which is the same on both
machines wherever the folder is. A task carries that id, so the receiving machine files it
under whatever its own folder for that repo is called. A lane without git is matched by
its name. A lane's questions and answers travel under the same key and are written into
that lane's own folder on each machine; a lane the other machine doesn't have yet keeps
its records in the sync state and they land when the repo shows up there.

A task whose lane only the other machine has stays that machine's, even when a lane here
has the same name (two `marketing` lanes, two different repos): it isn't put in this
machine's lane's brief or started here, Home says it waits for the other computer, and its
goal isn't called stalled while it waits (`laneids.mjs otherMachine`).

## Transport

A private git repo (or any folder both machines can reach: a bare repo on a shared drive,
a USB stick) holds:

- `keys.json`: the sync key, wrapped with a key made from the vault PIN (scrypt, N=2^17)
- `machines/<id>.enc`: each machine's whole syncable state, AES-256-GCM with the sync key

Each machine writes only its own file, so a push never conflicts in git; every machine
reads all the others and merges them into itself. Nothing in the repo is readable without
the PIN: not a task, a name, a memory or a secret. The commit message says only which
machine id synced.

A direct link between the two (the phone relay already does encrypted machine-to-machine
traffic) can carry the same files later; the format doesn't change.

## Pairing

1. First machine: `symbiot sync init <private repo url>` makes the sync key, wraps it with
   the vault PIN, and pushes `keys.json`.
2. Second machine: `symbiot sync pair <same url>` clones it, asks for the vault PIN
   (checked against `keys.json`; five wrong tries lock it as the Vault page does), and keeps
   the sync key in its own vault. If it has no vault PIN yet, that PIN becomes it.
3. Either: `symbiot sync now` (and the app does it on its own while it runs).

## Conflicts

Each record field carries the time it last changed on the machine that changed it. Merging
takes, per field, the newer change; a deleted record leaves a tombstone with its time, so a
delete on one side wins only over older changes on the other. Both sides having changed the
same field since they last met is a conflict: the newer change wins, and the one it
replaced is written to `sync-conflicts.json` so nothing is lost silently. Two exceptions:

- memory facts can't conflict (each fact is its own record);
- an `ANSWERS.md` changed on both sides keeps every answer from both.

## Not in the first build

- the Settings card to pair from the app (the commands do it today)
- the direct link transport
