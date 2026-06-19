const reportHandler = require("./report");

module.exports = async function scheduledReport(req, res) {
  req.query = { ...(req.query || {}), warm: "1" };
  return reportHandler(req, res);
};
