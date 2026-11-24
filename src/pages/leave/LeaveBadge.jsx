import { Badge } from "../../components/ui";
import { LEAVE_STATUS } from "../../hooks/leave";

export default function LeaveBadge({ status }) {
  return <Badge status={status === "cancelled" ? "planned" : status} label={LEAVE_STATUS[status] || status} />;
}
