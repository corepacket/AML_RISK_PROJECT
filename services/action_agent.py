from services.account_service import AccountService
from services.flag_service import FlagService
from services.notification_service import NotificationService
from services.case_service import CaseService
from services.audit_service import AuditService


account_service = AccountService()
flag_service = FlagService()
notification_service = NotificationService()
case_service = CaseService()
audit_service = AuditService()


def action_agent(state):

    decision = state["final_decision"]
    customer_id = state["transaction"]["customer_id"]
    transaction_id = state["transaction"]["transaction_id"]

    actions = decision.get("recommended_actions", [])
    results = {}

    for action in actions:

        if action == "FREEZE_ACCOUNT":
            result = account_service.freeze_account(customer_id)
            results["freeze"] = result

            audit_service.log_action({
                "customer_id": customer_id,
                "action": "FREEZE_ACCOUNT"
            })

        elif action == "RAISE_FLAG":
            result = flag_service.raise_flag(
                customer_id,
                reason="Suspicious AML activity"
            )
            results["flag"] = result

            audit_service.log_action({
                "customer_id": customer_id,
                "action": "RAISE_FLAG"
            })

        elif action == "CREATE_CASE":
            case_result = case_service.create_case(
                customer_id,
                transaction_id,
                decision["risk_score"]
            )
            results["case"] = case_result

            audit_service.log_action({
                "customer_id": customer_id,
                "action": "CREATE_CASE",
                "case_id": case_result["case_id"]
            })

        elif action == "NOTIFY_COMPLIANCE":
            case_id = results.get("case", {}).get("case_id")
            if case_id:
                notify_result = notification_service.notify_compliance(case_id)
                results["notification"] = notify_result

                audit_service.log_action({
                    "customer_id": customer_id,
                    "action": "NOTIFY_COMPLIANCE",
                    "case_id": case_id
                })

    state["action_results"] = results

    return state
