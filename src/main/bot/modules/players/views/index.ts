import { ViewModule } from "../../../utils/ViewModule";
import points_command from "./commands/points";
import stats_command from "./commands/stats";

export default new ViewModule([stats_command, points_command])