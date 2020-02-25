var ElementBase = require("../elementBase");
var Retriever = require("../retriever");
var $ = require("../../lib/qsa");
require("../results-table");
require("../county-map");
require("./county-detail.less");

var { formatAPDate, formatTime, groupBy, mapToElements, toggleAttribute } = require("../utils");

var fips = require("../../../../data/fips.sheet.json");

var colors = ["purple", "magenta", "yellow", "green", "orange"];

class CountyDetail extends ElementBase {

  constructor() {
    super();
    this.fetch = new Retriever(this.load);
    this.palette = {};
  }

  static get boundMethods() {
    return ["load", "onSelectCounty"];
  }

  static get observedAttributes() {
    return ["src", "party", "live", "map"];
  }

  static get mirroredProps() {
    return ["src"];
  }

  attributeChangedCallback(attr, was, value) {
    switch (attr) {
      case "src":
        this.fetch.watch(value, this.getAttribute("live") || 60);
        break;

      case "party":
        this.render();
        break;

      case "live":
        if (typeof value == "string") {
          this.fetch.start(value);
        } else {
          this.fetch.stop();
        }
        break;

      case "map":
        var elements = this.illuminate();
        elements.map.src = value;
        break;
    }
  }

  load(data) {
    this.cache = data;
    this.render();
  }

  render() {
    var elements = this.illuminate();
    var data = this.cache;
    if (!data) return;
    var { races, test } = data;

    var party = this.getAttribute("party");

    var results = [].concat(...races.filter(r => r.party == party).map(r => r.results));
    var counties = {};
    var fips = {};
    results.forEach(function(r) {
      counties[r.county] = r.fips;
      fips[r.fips] = r.county;
    });

    counties = Object.keys(counties).map(county => ({ county, id: counties[county] }));
    mapToElements(elements.countySelect, counties, function(data) {
      var option = document.createElement("option");
      option.innerHTML = data.county;
      option.value = data.id;
      return option;
    });

    var value = elements.countySelect.value;
    this.updateTable(value);

  }

  updateTable(fips) {
    if (fips == 0) return;
    var elements = this.illuminate();
    var { resultsTable } = elements;
    var data = this.cache;
    var party = this.getAttribute("party");
    if (!data || !party) return;

    var { races } = data;
    var [ race ] = races.filter(r => r.party == party);

    var totals = {};
    var [ result ] = race.results.filter(function(r) {
      r.candidates.forEach(function(candidate) {
        if (!totals[candidate.id]) totals[candidate.id] = {
          first: candidate.first,
          last: candidate.last,
          id: candidate.id,
          votes: 0
        };
        totals[candidate.id].votes += candidate.votes;
      });
      return r.fips == fips;
    });

    var statewide = Object.values(totals);
    statewide.sort((a, b) => b.votes - a.votes);

    var palette = {};
    statewide.slice(0, colors.length).forEach(function(s, i) {
      palette[s.id] = {
        id: s.id,
        first: s.first,
        last: s.last,
        color: colors[i]
      };
    });
    elements.map.render(palette, race.results);

    resultsTable.setAttribute("headline", result.county);
    if (result) resultsTable.render(result);
  }

  static get template() {
    return require("./_template.html");
  }

  onSelectCounty() {
    var elements = this.illuminate();
    var fips = elements.countySelect.value;
    this.updateTable(fips);
  }

  illuminate() {
    var elements = super.illuminate();
    elements.countySelect.addEventListener("change", this.onSelectCounty);
    return elements;
  }

}

CountyDetail.define("county-detail");