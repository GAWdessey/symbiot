# Syncing the desktop's work to this computer (16 Nov 2026)

**Short answer: this computer is already paired and syncing. Nothing is missing on this side; nothing needs overwriting.**

- Sync is `sync.mjs` (docs/SYNC.md), CLI `symbiot sync init|pair|now|status`, installed symbiot 0.94.x.
- `symbiot sync status`: paired with github.com/GarthGhostai/symbiot-sync.git as "laptop" (ff19208a0731). Last sync 16 Nov 06:33; the app runs it every 5 minutes (commits "sync: ff19208a0731" every 5 min up to 06:33).
- The other computer (50f4d47fc3aa) last pushed its state on **15 Nov 05:59**. This computer last read it on 12 Nov, and every 5-minute sync since has merged what is in the repo.
- So anything the desktop did **after 15 Nov 05:59** is not in the repo yet. One step on the desktop: have its Symbiot app running (it syncs every 5 minutes) or run `symbiot sync now` there; then it arrives here within 5 minutes, or run `symbiot sync now` here.
- Counts per kind (memory, rules, tasks, vault) are not readable from this run: the files are sealed with a key in the vault, which runs can't open. `symbiot sync now` prints tasks and facts counts; sync-conflicts.json lists any change made on both sides (the newer was kept).
- I did not run a sync from this run: it can't write to ~/.config/symbiot, and the app already does it.

Bug fixed: Home's assistant now has a context line saying sync is built, paired or not, the last sync time and how to run it (home.mjs `syncLines`, test/synchome.mjs, 0.94.13).
