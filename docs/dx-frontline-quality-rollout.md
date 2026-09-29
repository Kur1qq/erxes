# Frontline TypeScript and ESLint rollout (fork pilot)

Measured from upstream `main` commit `f465fa7416f392bf56981c9c080c0aa476a531ad` on 2026-09-29. This document and the pilot workflow are on the `Kur1qq/erxes` fork only. No upstream PR or issue has been created.

## Reproducible baseline

```sh
pnpm exec eslint --config frontend/plugins/frontline_ui/eslint.config.js \
  --rule '@typescript-eslint/no-explicit-any:error' \
  --rule '@nx/enforce-module-boundaries:off' \
  --ext .ts,.tsx --format json frontend/plugins/frontline_ui/src

pnpm exec tsc --noEmit --pretty false \
  -p frontend/plugins/frontline_ui/tsconfig.app.json
```

The ESLint JSON has **189 `@typescript-eslint/no-explicit-any` messages in 81 Frontline source files**. It also has nine messages from other rules; those are excluded from this count. The earlier 202 count was from an older commit and is not the current baseline. The complete per-file count is below.

The TypeScript command has **70 diagnostics**: 27 in `frontline_ui`, 19 in `erxes-ui`, and 24 in `ui-modules`. The earlier 71 included a duplicate JSX attribute in `erxes-ui/src/components/date-picker.tsx`; that diagnostic is gone on this commit. These are compiler diagnostics across the Frontline project and imported source, not 70 independent bugs.

## Fork CI experiment

Workflow: `.github/workflows/dx-frontline-any-fork-pilot.yml`. Reused `scripts/check-new-any.mjs` from the prior `feat/dx-new-any-gate` fork experiment. The job uses Node 22, pnpm 9.12.3, a full-history checkout, read-only contents permission, and no deployment credentials or production secrets. It runs only on push to `feat/dx-frontline-any-rollout`.

1. Run the script's parser/ESLint self-test and check the actual branch against the measured base commit.
2. In the disposable CI runner, append a typed line to a file that already contains an explicit `any`. Commit the test line locally in that runner. The gate must pass.
3. In a separate step, append an explicit `any` line to that same file. Commit that test line only in the runner. The gate must reject it and identify the added line.

The probe commits never leave the runner. No Frontline source file is changed in the pushed branch. The local self-test passed. The fork run URL and both step results should be recorded here after the push.

The gate compares changed line numbers with ESLint `no-explicit-any` diagnostics. It detects explicit `any` on added lines. It does not check implicit `any`, unsafe use of values typed `any`, or unchanged old lines. A moved/reformatted old `any` may count as newly added; a rewritten line with a new explicit `any` will be caught. The gate is scoped to Frontline source only.

## Proposed upstream PR after fork verification

This is a design, not an applied upstream change. Decide the required-check policy with the maintainers before making the upstream PR.

| Stage | Trigger and behavior | Proposed required status |
| --- | --- | --- |
| First small PR | `pull_request` against `main`; checkout PR merge commit with history; derive baseline from `github.event.pull_request.base.sha` instead of a fixed SHA; run Frontline new-any gate and a report-only TypeScript check. Never use deployment secrets. | Keep TypeScript report informational. Consider requiring the new-any gate only after fork tests and a representative upstream PR pass. |
| Later baseline gate | Compare Frontline TypeScript diagnostics with a refreshed baseline, including the 27/19/24 ownership split. Document that count-based baselines can miss a new error when another is removed. | Require only after it is stable and owners accept the limitation. |
| Clean project | Once its existing diagnostics are fixed, run unbaselined `tsc --noEmit` on each PR. | Require the full check. |

Avoid workflow-level `paths` filters for a required status: a skipped required workflow can leave a PR pending. Instead let the job succeed quickly when no Frontline TypeScript lines changed. If this pilot becomes required, test the PR merge context, fork PR permissions, runner time, and a PR with no Frontline changes first. The hard-coded SHA in this fork pilot must not be copied into the production workflow.

## TypeScript remediation queues

No `CODEOWNERS` file was found. The project/path names below are technical ownership boundaries, not assigned people. Create or assign issues only after the maintainers identify owners. The counts are diagnostic counts from the command above; fix by root cause and remeasure rather than opening one issue per diagnostic.

| Issue draft | Owning project | Diagnostics | First investigation |
| --- | --- | ---: | --- |
| Frontline inbox and response templates | `frontline_ui` | 11 | Response template exports/state/update types, conversation identifiers and nullable props. One use-before-declaration may be a runtime bug. |
| Frontline automation Facebook forms | `frontline_ui` | 9 | Trigger discriminated unions, `never`-typed form values, duplicate `postType`. |
| Frontline status, channels, pipelines, ticket, integration | `frontline_ui` | 7 | Missing or nullable props, route/atom names, status guard and permission model. |
| Chart and editor components | `erxes-ui` | 15 | Recharts tooltip types and BlockNote/icon component contracts. |
| Remaining shared UI exports and props | `erxes-ui` | 4 | Duplicate export, email upload type, missing phone type, motion preset. |
| Tags feature | `ui-modules` | 10 | Missing exports/fields and nullable tag selections. |
| Documents and automations | `ui-modules` | 11 | Editor block types, missing table exports, nullable transfer data, `qz-tray` types. |
| Other shared modules | `ui-modules` | 3 | Customer owner type, BlockNote input, lodash declaration. |

The totals are 27 Frontline, 19 `erxes-ui`, and 24 `ui-modules`. A plugin-only fix must stay in `frontline_ui`; shared-library work is a separate, explicitly scoped task. These queues are issue drafts only and have no named assignee yet.

## Explicit-any file inventory

The count is ESLint rule diagnostics, not a text search; one file can contain several diagnostics. Paths below are relative to `frontend/plugins/frontline_ui/src/`.

| Count | File |
| ---: | --- |
| 10 | `modules/integrations/erxes-messenger/components/EMFormValueEffect.tsx` |
| 9 | `modules/forms/components/FormValueEffectComponent.tsx` |
| 9 | `modules/integrations/call/components/SipProvider.tsx` |
| 6 | `modules/integrations/call/utils/callUtils.ts` |
| 6 | `modules/report/components/conversation-charts/ConversationResponse.tsx` |
| 6 | `modules/report/components/conversation-charts/ConversationSource.tsx` |
| 6 | `modules/report/components/conversation-charts/ConversationTag.tsx` |
| 6 | `modules/report/components/ticket-charts/TicketCustomProperties.tsx` |
| 6 | `modules/report/components/ticket-charts/TicketTags.tsx` |
| 5 | `modules/report/components/ticket-charts/TicketSource.tsx` |
| 4 | `modules/forms/components/FormPreview.tsx` |
| 4 | `modules/integrations/call/components/InCall.tsx` |
| 4 | `modules/integrations/call/hooks/useAddCustomer.ts` |
| 4 | `modules/report/components/conversation-charts/ConversationOpen.tsx` |
| 4 | `modules/report/components/conversation-charts/ConversationResolved.tsx` |
| 4 | `modules/report/components/ticket-charts/TicketOpenDate.tsx` |
| 4 | `widgets/automations/modules/facebook/components/history/useFacebookAutomationHistoryResult.ts` |
| 3 | `modules/integrations/types/Integration.ts` |
| 3 | `modules/ticket/components/ticket-detail/TicketFields.tsx` |
| 3 | `modules/utils.ts` |
| 3 | `widgets/automations/modules/facebook/components/action/components/replyMessage/FacebookMessageContent.tsx` |
| 3 | `widgets/automations/modules/facebook/components/trigger/components/message/MessageTriggerConfigPanel.tsx` |
| 2 | `modules/channels/components/settings/members/MemberMoreColumn.tsx` |
| 2 | `modules/forms/components/form-page/command-bar/delete/form-delete.tsx` |
| 2 | `modules/forms/components/form-page/command-bar/status/form-status-toggle.tsx` |
| 2 | `modules/forms/components/FormMutateLayout.tsx` |
| 2 | `modules/integrations/call/components/CallTabs.tsx` |
| 2 | `modules/integrations/call/components/IncomingCall.tsx` |
| 2 | `modules/integrations/call/utils/renderUserInfo.tsx` |
| 2 | `modules/integrations/facebook/types/FacebookBot.ts` |
| 2 | `modules/integrations/instagram/types/InstagramBot.ts` |
| 2 | `modules/report/components/ticket-charts/TicketStatusSummary.tsx` |
| 2 | `modules/responseTemplate/components/command-bar/delete/response-delete.tsx` |
| 2 | `modules/status/hooks/useUpdateTicketStatus.tsx` |
| 2 | `modules/ticket-legacy/components/KanbanCard.tsx` |
| 2 | `widgets/automations/modules/facebook/components/bots/components/automationFacebookBotsColumns.tsx` |
| 2 | `widgets/automations/modules/instagram/components/bots/components/automationInstagramBotsColumns.tsx` |
| 2 | `widgets/automations/modules/instagram/components/bots/components/InstagramPageInfo.tsx` |
| 2 | `widgets/automations/modules/instagram/components/InstagramBotSelector.tsx` |
| 2 | `widgets/automations/modules/instagram/components/trigger/utils/messageTriggerUtils.tsx` |
| 1 | `modules/channels/hooks/useChannelMemberRemove.tsx` |
| 1 | `modules/channels/hooks/useChannelMembersAdd.tsx` |
| 1 | `modules/channels/hooks/useChannelMemberUpdate.tsx` |
| 1 | `modules/channels/hooks/useGetChannel.tsx` |
| 1 | `modules/forms/components/actions/remove-form.tsx` |
| 1 | `modules/forms/components/FormContent.tsx` |
| 1 | `modules/forms/types/formTypes.ts` |
| 1 | `modules/inbox/types/inbox.ts` |
| 1 | `modules/integrations/call/components/CallConversationDetail.tsx` |
| 1 | `modules/integrations/call/components/CallWidgetDraggable.tsx` |
| 1 | `modules/integrations/call/hooks/useCurrentCallSession.ts` |
| 1 | `modules/integrations/call/states/sipStates.ts` |
| 1 | `modules/integrations/call/types/callTypes.ts` |
| 1 | `modules/integrations/constants/integrationImages.ts` |
| 1 | `modules/integrations/erxes-messenger/hooks/useEditMessenger.tsx` |
| 1 | `modules/integrations/hooks/useIntegrationEdit.tsx` |
| 1 | `modules/integrations/instagram/components/InstagramIntegrationDetail.tsx` |
| 1 | `modules/pipelines/types/index.ts` |
| 1 | `modules/report/call/CallReportsPage.tsx` |
| 1 | `modules/report/components/chart-export/ChartExportButton.tsx` |
| 1 | `modules/report/components/conversation-charts/ConversationList.tsx` |
| 1 | `modules/report/components/date-selector/DateSelector.tsx` |
| 1 | `modules/report/hooks/useConversationReportByDate.ts` |
| 1 | `modules/report/hooks/useConversationReportsByStatus.ts` |
| 1 | `modules/report/hooks/useConversationResolvedByDate.ts` |
| 1 | `modules/responseTemplate/components/command-bar/response-command-bar.tsx` |
| 1 | `modules/responseTemplate/components/CreateResponseForm.tsx` |
| 1 | `modules/responseTemplate/types/index.ts` |
| 1 | `modules/ticket/components/add-ticket/AddTicketForm.tsx` |
| 1 | `modules/ticket/components/ticket-selects/PriorityInline.tsx` |
| 1 | `modules/ticket/components/ticket-selects/SelectStatusTicket.tsx` |
| 1 | `modules/ticket/types/index.ts` |
| 1 | `widgets/automations/modules/facebook/components/action/components/FacebookMessageButtonsGenerator.tsx` |
| 1 | `widgets/automations/modules/facebook/components/action/components/replyMessage/FacebookBotMessage.tsx` |
| 1 | `widgets/automations/modules/facebook/components/action/components/replyMessage/FacebookMessages.tsx` |
| 1 | `widgets/automations/modules/facebook/components/trigger/components/message/MessageTriggerConditionCard.tsx` |
| 1 | `widgets/automations/modules/instagram/components/action/components/replyComment/ActionCommentConfigContent.tsx` |
| 1 | `widgets/automations/modules/instagram/components/trigger/components/DirectMessageConfigForm.tsx` |
| 1 | `widgets/automations/modules/instagram/components/trigger/components/InstagramBotPersistenceMenuSelector.tsx` |
| 1 | `widgets/automations/modules/instagram/components/trigger/components/TriggerConfigContent.tsx` |
| 1 | `widgets/notifications/my-inbox/components/NotificationConversationDetail.tsx` |
