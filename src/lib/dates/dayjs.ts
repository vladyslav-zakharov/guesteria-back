import dayjsBase from "dayjs";
import utc from "dayjs/plugin/utc.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjsBase.extend(utc);
dayjsBase.extend(customParseFormat);

/**
 * The only dayjs instance in the app, with `utc` and `customParseFormat`
 * loaded. Import dayjs from here, never from the package directly, so every
 * caller gets the plugins.
 */
export const dayjs = dayjsBase;
