# Existing direct conversation delegation

This isolated seam lets a trusted independent agent read/respond in an existing two-human direct channel. It does not add a channel member, change channel kind, impersonate a human, enroll an agent or activate a production grant.

The server-owned `externalAgent.teamBridge.v1.channel.<channelId>` binding contains:

```ts
{ agentId, task: { taskId, version }, delegatedDirect: {
  sourceStaffId, fromSeq, audienceHash, grantVersion, clientRevision, expiresAt
} }
```

`audienceHash` is `directDelegationAudienceHash(channel)`. The binding must match the current exact task version, grant version/client revision/absolute expiry and current two-human audience. The sponsor must remain the active same-store admin/manager who owns and belongs to this direct channel. Both humans must be allowlisted, active and bound to current same-store user records. No binding or any mismatch fails closed. Direct delegation permits only `messages.read` and `messages.send`, with a fresh post-floor employee text required before sending. It grants no general native membership or conversation-creation capability.

`readAuthorizedBridgeChannel(db, grant, task, channelId, currentChannel?, nowMs?)` returns `{channel, fromSeq, delegatedDirect, sourceStaffId?}`. Callers must separately re-resolve the current grant/action and authoritative task ACL. Runtime begin/fresh checks and source projections must enforce this returned `fromSeq`, including original-source reads. Native read/send uses the same helper through a private WeakMap actor capability, including before returning old request receipts.

Independent output retains `authorId = agent:<agentId>` and agent provenance. Mandatory communication isolation/outbound proof checks remain in place. The existing physical-agent group membership path remains available without a direct delegation.

Run the narrow isolated regression after API compilation:

```sh
python3 scripts/with-docker-test.py -- python3 scripts/test-team-agent-direct-delegation.py
```

The regression uses disposable PostgreSQL and actual native services, with synthetic communication policy ports. It does not prove real Hermes execution or runtime source/proof capture. Native direct event intake (`recordTeamAgentReply`), production binding/grant creation, unique consumer routing and actual employee-runtime integration are intentionally outside this seam and require the main integration owner.
