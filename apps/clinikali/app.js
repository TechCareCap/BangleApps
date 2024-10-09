Bangle.loadWidgets();
Bangle.drawWidgets();

let settings;

function loadSettings() {
  settings = require("Storage").readJSON("clinikali.json", 1) || {};
  let changed = false;
  if (!settings.file) {
    changed = true;
    settings.file = "clinikali.log0.csv";
  }
  if (changed) require("Storage").writeJSON("clinikali.json", settings);
}
loadSettings();

function updateSettings() {
  require("Storage").writeJSON("clinikali.json", settings);
  if (WIDGETS.recorder) WIDGETS.recorder.reload();
}

function getTrackNumber(filename) {
  const matches = filename.match(/^clinikali\.log(.*)\.csv$/);
  if (matches) return matches[1];
  return 0;
}

function showMainMenu() {
  const mainmenu = {
    "": { title: "Recorder" },
    "< Back": () => {
      load();
    },
    RECORD: {
      value: !!settings.recording,
      onchange: (v) => {
        setTimeout(() => {
          E.showMenu();
          WIDGETS.recorder.setRecording(v).then(() => {
            loadSettings();
            showMainMenu();
          });
        }, 1);
      },
    },
    File: { value: getTrackNumber(settings.file) },
    "View Tracks": () => {
      viewTracks();
    },
    "Time Period": {
      value: settings.period || 10,
      min: 1,
      max: 120,
      step: 1,
      format: (v) => `${v}s`,
      onchange: (v) => {
        settings.recording = false; // stop recording if we change anything
        settings.period = v;
        updateSettings();
      },
    },
  };
  return E.showMenu(mainmenu);
}

function viewTracks() {
  const menu = {
    "": { title: "Tracks" },
  };
  let found = false;
  require("Storage")
    .list(/^clinikali\.log.*\.csv$/, { sf: true })
    .reverse()
    .forEach((filename) => {
      found = true;
      menu[getTrackNumber(filename)] = () => viewTrack(filename, false);
    });
  if (!found) menu["No Tracks found"] = () => {};
  menu["< Back"] = () => {
    showMainMenu();
  };
  return E.showMenu(menu);
}

function getTrackInfo(filename) {
  "ram";
  let starttime;
  let duration = 0;

  const f = require("Storage").open(filename, "r");

  if (f === undefined) return;

  let l = f.readLine(f);
  let timeIdx;
  let c;

  if (l !== undefined) {
    const fields = l.trim().split(",");
    timeIdx = fields.indexOf("Time");
    l = f.readLine(f);
  }

  if (l !== undefined) {
    c = l.split(",");
    starttime = Number.parseInt(c[timeIdx]);
  }

  if (c) duration = Number.parseInt(c[timeIdx]) - starttime;

  return {
    fn: getTrackNumber(filename),
    filename: filename,
    time: new Date(starttime * 1000),
    duration: Math.round(duration),
  };
}

function asTime(v) {
  const mins = Math.floor(v / 60);
  const secs = v - mins * 60;
  return `${mins.toString()}m ${secs.toString()}s`;
}

function viewTrack(filename, info) {
  if (!info) {
    E.showMessage("Loading...", `Track ${getTrackNumber(filename)}`);
    info = getTrackInfo(filename);
  }
  //console.log(info);
  const menu = {
    "": { title: `Track ${info.fn}` },
  };
  if (info.time)
    menu[info.time.toISOString().substr(0, 16).replace("T", " ")] = {};
  menu.Duration = { value: asTime(info.duration) };
  menu.Records = { value: `${info.records}` };
  menu.Erase = () => {
    E.showPrompt("Delete Track?").then((v) => {
      if (v) {
        settings.recording = false;
        updateSettings();
        const f = require("Storage").open(filename, "r");
        f.erase();
        viewTracks();
      } else viewTrack(filename, info);
    });
  };
  menu["< Back"] = () => {
    viewTracks();
  };
  return E.showMenu(menu);
}

showMainMenu();
