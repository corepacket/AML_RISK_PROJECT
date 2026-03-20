class NotificationService:

    def notify_compliance(self, case_id: str):
        print(f"[NOTIFY] Compliance notified for case {case_id}")

        return {
            "status": "SENT",
            "target": "COMPLIANCE_TEAM"
        }
