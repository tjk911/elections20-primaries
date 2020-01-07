var axios = require("axios");
var fs = require("fs").promises;
var depths = require("./depths");

var etags = {};

var resultsURL = "https://api.ap.org/v2/elections/";
var resultsParams = {
  apikey: process.env.AP_API_KEY,
  uncontested: false,
  format: "json"
};

var apDate = function(d) {
  if (typeof d == "string") {
    var [m, d, y] = d.split("/");
    d = new Date(y, m - 1, d);
  }
  return [
    d.getFullYear(),
    (d.getMonth() + 1).toString().padStart(2, "0"),
    d
      .getDate()
      .toString()
      .padStart(2, "0")
  ].join("-");
};

var issueTickets = function(races) {
  // build a list of "tickets" - API requests that will satisfy the races we want
  var tickets = [];
  // races that have their own ID need their own ticket
  var generic = races.filter(function(r) {
    if (!r.raceID) return true;
    tickets.push({
      date: apDate(r.timestamp),
      params: {
        raceID: r.raceID,
        statePostal: r.state,
        level: r.office == "H" ? "state" : "FIPScode"
      }
    });
  });
  // split into at least two sets of tickets, based on geographic specificity
  // only house races do not use county results
  var stateLevel = generic.filter(r => r.office == "H");
  var countyLevel = generic.filter(r => r.office != "H");

  [stateLevel, countyLevel].forEach(function(list, requestCounties) {
    // group races by date
    var byDate = {};
    list.forEach(function(r) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });
    // issue tickets for each day's combo of items
    for (var d in byDate) {
      var date = apDate(d);
      var list = byDate[d];
      var states = list.map(r => r.state);
      var offices = list.map(r => r.office);
      tickets.push({
        date,
        params: {
          level: requestCounties ? "FIPScode" : "state",
          statePostal: [...new Set(states)],
          officeID: [...new Set(offices)]
        }
      });
    }
  });
  return tickets;
};

var redeemTicket = async function(ticket, options) {
  var tag =
    ticket.date +
    "_" +
    Object.keys(ticket.params)
      .sort()
      .map(p => `${p}=${ticket.params[p]}`)
      .join("&");
  if (options.offline) {
    try {
      var json = await fs.readFile(`temp/${tag}.json`);
      var data = JSON.parse(json);
      console.log(`Loaded offline data from temp/${tag}.json`);
      return data;
    } catch(err) {
      console.log(`Couldn't load data for tag ${tag} - does the file exist?`);
      throw err;
    }
  } else {
    var headers = {};
    if (etags[tag]) headers["If-None-Match"] = etags[tag];
    try {
      var response = await axios({
        url: resultsURL + ticket.date,
        params: Object.assign({}, resultsParams, ticket.params, { test: !!options.test }),
        headers,
        validateStatus: status => status == 200 || status == 304
      });
      console.log(`Loaded API data for ${tag}`);
      if (response.status == 304) {
        console.log(`No change since last request for ${tag}`);
        var proxyOptions = Object.assign({}, options, { offline: true });
        var data = await redeemTicket(ticket, proxyOptions);
        return data;
      }
      var data = response.data;
      await fs.mkdir("temp", { recursive: true });
      await fs.writeFile(`temp/${tag}.json`, JSON.stringify(data, null, 2));
      etags[tag] = response.headers.etag;
      return data;
    } catch (err) {
      console.log(err);
      // throw err;
    }
  }
}

module.exports = { issueTickets, redeemTicket };