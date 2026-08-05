# ee/

Everything in this directory is covered by `ee/LICENSE`, not the Apache 2.0
license at the repository root.

The directory and its license existed from day one, empty, so that adding a
paid feature later is adding a file rather than relicensing a project. Every
open-source company that tightened a license after it had outside contributors
got forked, usually within two to twelve weeks. Every one that settled the
boundary before contributors arrived did not.

The first file has arrived:

- **[watch/](watch/)** — the hosted watch. A sweep across every installation
  of the GitHub App: it decides which repositories anything could have
  changed for, scans them with the same public CLI everyone can read, and
  opens one cited pull request per repository, serially. `watch/DESIGN.md`
  is the contract; `test/watch.mjs` at the repository root holds it to it.

Still to come behind this line: SSO, audit, and the fleet view, which is
where the entire roster of comparable companies draws the same boundary.
