# Asymmetry Team And Coordination

Team: Devin 1 = Jack; Devin 2 = Bayzhan; Devin 3 = Jad; Devin 4 = Akash.
Coordinator: Jack (Devin 1).

## Named Owners

| Role | Person | Branch | Exclusive Build Area |
|------|--------|--------|----------------------|
| Devin 1 / D1 | Jack | `devin-1` | Foundation, shared contracts, DB, auth, composition, integration |
| Devin 2 / D2 | Bayzhan | `devin-2` | Agent runtime, messaging, subchat orchestration |
| Devin 3 / D3 | Jad | `devin-3` | Memory, classification, permissions, seed data |
| Devin 4 / D4 | Akash | `devin-4` | Frontend, task chat UI, network visualization |

Names identify human operators, not authenticated GitHub usernames.
The assignment uses Jack's selection of Devin 1 and the order of the other
three names supplied in chat. Change assignments here explicitly if needed.

## Jack's Coordinator Role

- Maintain the shared contracts and dependency/ownership decisions.
- Coordinate foundation readiness and the integration merge sequence.
- Route cross-layer blockers to Bayzhan, Jad, or Akash through GitHub issues.
- Track review readiness and the exact commit SHA that was reviewed.
- Own final integration evidence and the demo-readiness decision.
- Do not implement another owner's layer merely because it is blocked.
- Coordination does not bypass independent review of Jack's own code.

## Addressing Work

- Use the role plus name: `[D2 Bayzhan]`, `[D3 Jad]`, `[D4 Akash]`,
  `[D1 Jack]`; use `[ALL]` for team-wide decisions.
- Tag the operator's verified GitHub username, not an assumed spelling.
- GitHub handles for Bayzhan, Jad, and Akash are not yet provided.
- Jack's known repository namespace is `thejackluo`; each operator must
  confirm their actual authenticated account in the agent registry.
- One person may run several sessions. Sessions still claim exactly one
  task/role at a time using `CLAIM Dn/session-id` in the relevant issue.
- Every session polls comments and the project board every five minutes.
- Shared documents list the whole roster; role-specific specifications and
  kickoff prompts name their exact accountable owner.

## Cadence And Privacy

- Commit and push meaningful checkpoints every 2-3 minutes while actively
  editing. Never manufacture empty commits or skip secret checks.
- Phone numbers from team chat are not repository metadata and must not be
  copied into specs, issues, prompts, or example seed records.
- Names in this file do not authorize contact outside the project workflow.
- Setup still requires verified GitHub handles, project access, review-model
  availability, and secure OpenAI API-key provisioning.
