import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import ImportExportLayout from "./ImportExportLayout";

const ImportExport = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<ImportExportLayout />
		</HasPermission>
	);
};

export default ImportExport;
