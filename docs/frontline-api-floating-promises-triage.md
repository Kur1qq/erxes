# Frontline API floating Promise triage

Measured locally on fork commit `98fe978d2f` with ESLint's typed
`@typescript-eslint/no-floating-promises` rule: 61 findings in 636
`frontline_api` source files. The fork CI pilot reports findings without failing
for them. A finding means a returned Promise has no observed rejection path; it
does not by itself prove that a production failure occurred.

## Findings by operation

| Operation                                                                                             | Findings | What to review                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------- |
| `graphqlPubsub.publish`                                                                               |       39 | Redis event delivery after a data change; decide whether the caller must await delivery or log a failed best-effort publish. |
| Event helpers (`publishMessage`, `publishConversationsChanged`, `pConversationClientMessageInserted`) |        8 | These helpers perform async work; callers currently proceed without observing completion or rejection.                       |
| Notification helpers (`sendNotification`, `sendNotifications`)                                        |        5 | Confirm whether delivery is part of the mutation contract or best effort, then handle failure explicitly.                    |
| Migration CLI entry points (`command()`)                                                              |        3 | Review top-level rejection and process exit behavior in the standalone migrations.                                           |
| Startup (`startPlugin`, `startCustomDomainWorker`)                                                    |        2 | Review how initialization failures are surfaced and whether the service should start without the worker.                     |
| Queue insertion (`sendWorkerQueue(...).add`)                                                          |        2 | Failed enqueue may leave an automation action unprocessed; decide whether the caller should wait or report the failure.      |
| `formSubmission.save()`                                                                               |        1 | The resolver returns before this existing submission update finishes.                                                        |
| `this.defaultFilters()`                                                                               |        1 | The constructor starts async filter setup without waiting; `buildAllQueries()` later calls and awaits the same method.       |

The totals above sum to 61. The largest module groups are inbox (23 findings)
and ticket (22); grouping by operation cuts across those modules.

## First code reviews

1. `src/modules/form/graphql/resolvers/mutations/forms.ts:144`: an existing
   submission is saved without awaiting `save()`, while the create path in the
   same loop is awaited. Check whether callers need the updated value to be
   persisted before the resolver returns.
2. `src/modules/integrations/facebook/meta/automation/messages/index.ts:109`
   and `src/modules/integrations/instagram/meta/automation/messages/index.ts:25`:
   `.add(...)` returns a Promise that is not handled. Check expected behavior
   when Redis/BullMQ cannot enqueue the previous action.
3. `src/main.ts:56,78`: startup and a worker launch are not awaited or caught.
   Confirm which failures should stop startup and which should be logged.
4. `src/modules/ticket/graphql/resolvers/mutations/pipeline.ts:28,31` and
   `src/modules/ticket/graphql/resolvers/mutations/ticket.ts:40,43`: successful
   database writes are followed by unhandled Redis publish Promises. Review the
   intended consistency between a successful mutation and its subscriptions.
5. `src/modules/inbox/conversationUtils.ts:163`: the constructor starts
   `defaultFilters()` asynchronously, while `buildAllQueries()` awaits a second
   invocation at line 405. Review the duplicate work and possible state race.

These are review priorities, not confirmed production bugs. Fixes to plugin
source need owner review, focused build/test validation, and the plugin guide
update required by the repository instructions.

## Rollout boundary

Keep the 61 existing findings visible in the report-only pilot. A separate
fork-only experiment can lint the whole API but reject findings only when their
reported line is added or changed in a PR. This gives developers a way to avoid
adding another unhandled Promise while the old findings are reviewed. A
changed-line gate has a blind spot: a type change elsewhere can make an
unchanged line unsafe. It should not be described as proving the whole project
is free of unhandled Promises.

The explicit-any and floating-Promise gates share the zero-context Git diff
parser in `scripts/git-diff-lines.mjs`. Both workflows run its regression tests
and the explicit-any self-test; the API workflow also runs the floating-Promise
self-test. Run these checks locally with:

```bash
node --test scripts/__tests__/git-diff-lines.test.mjs
node scripts/check-new-any.mjs --self-test
node scripts/check-new-floating-promises.mjs --self-test
```

Do not add `void` mechanically: it declares an intentional fire-and-forget
call but does not handle a rejected Promise. Choose `await`, a rejection
handler, or a documented best-effort policy according to the operation's
contract.
