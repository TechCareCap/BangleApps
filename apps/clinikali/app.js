Bangle.setBarometerPower(true, "clinikali");
Bangle.setHRMPower(true, "clinikali");

Bangle.loadWidgets();
Bangle.drawWidgets();

/**
 * @typedef {Object} AppSettings
 * @property {string[]} enabledSensors
 * @property {string} file
 * @property {boolean} isRecording
 * @property {number} localeOffset
 * @property {string} macAddress
 * @property {string} pid
 * @property {number} timePeriod
 */

/**
 * @param {string} message
 * @param {"info" | "warn" | "error"} severity
 *
 * @returns {void}
 */
function logMessage(message, severity) {
  const timestamp = new Date()
    .toISOString()
    .replace("T", " - ")
    .replace("Z", "");

  const logEntry = `${timestamp} [${severity}] ${message}\n`;

  console.log(logEntry);

  return require("Storage").open("clinikali.log.txt", "a").write(logEntry);
}

/**
 * @returns {AppSettings}
 */
function getAppSettings() {
  /** @type {AppSettings} */
  const defaultSettings = {
    enabledSensors: ["accel", "baro", "hrm"],
    file: "",
    isRecording: false,
    localeOffset: 1,
    macAddress: "E8:F7:91:FB:61:DB",
    pid: "05",
    timePeriod: 1,
  };

  const appSettings = require("Storage").readJSON("clinikali.json", 1) || {};

  return Object.assign({}, defaultSettings, appSettings);
}

/**
 * @param {{ [key: string]: unknown }} settings
 *
 * @returns {void}
 */
function updateAppSettings(settings) {
  const currentSettings = getAppSettings();

  require("Storage").writeJSON(
    "clinikali.json",
    Object.assign(currentSettings, settings),
  );
  logMessage("[updateAppSettings] Settings updated", "info");

  if (WIDGETS["clinikali"]) {
    WIDGETS["clinikali"].reload();
  }
}

/**
 * @param {number} newTimePeriod
 *
 * @returns {void}
 */
function handleTimePeriodChange(newTimePeriod) {
  updateAppSettings({ isRecording: false, timePeriod: newTimePeriod });
  logMessage(
    `[handleTimePeriodChange] Update time period to ${newTimePeriod}`,
    "info",
  );
}

/**
 * @returns {string}
 */
function getCsvHeaders() {
  const enabledSensors = getAppSettings()["enabledSensors"];
  const headers = ["Time"];

  if (enabledSensors.includes("accel")) {
    headers.push("Accel X", "Accel Y", "Accel Z");
  }

  if (enabledSensors.includes("hrm")) {
    headers.push("Heartrate");
  }

  if (enabledSensors.includes("baro")) {
    headers.push("Temperature");
  }

  return headers.join(",");
}

/**
 * @returns {void}
 */
function toggleRecorder() {
  const isRecording = getAppSettings()["isRecording"];

  updateAppSettings({ isRecording: !isRecording });
  logMessage(
    `[toggleRecorder] Recording is ${isRecording ? "disabled" : "enabled"}`,
    "info",
  );

  if (WIDGETS["clinikali"]) {
    WIDGETS["clinikali"].setRecording(!isRecording);
  }

  if (isRecording) {
    return;
  }

  const currentDate = new Date().toISOString().split("T")[0];
  /** @type {string[]} */
  const fileExist = require("Storage").list(currentDate, { sf: true });
  let fileName = "";

  if (fileExist.length === 0 || fileExist[0] === undefined) {
    fileName = `${getAppSettings()["pid"]}_${currentDate}.csv`;
    logMessage(`[toggleRecorder] File created: ${fileName}`, "info");
    require("Storage")
      .open(fileName, "a")
      .write(getCsvHeaders() + "\n");
  } else {
    fileName = fileExist[0];
    logMessage(`[toggleRecorder] Append to file: ${fileName}`, "info");
  }

  console.log(fileName);

  updateAppSettings({ file: fileName });
}

/**
 * @param {string} sensorName
 *
 * @returns {void}
 */
function toggleSensor(sensorName) {
  const enabledSensors = getAppSettings()["enabledSensors"];
  const index = enabledSensors.indexOf(sensorName);

  if (index === -1) {
    updateAppSettings({
      enabledSensors: JSON.parse(
        JSON.stringify(enabledSensors.concat(sensorName)),
      ),
    });
    logMessage(`[toggleSensor] Sensor ${sensorName} enabled`, "info");
  } else {
    updateAppSettings({
      enabledSensors: enabledSensors.filter((sensor) => sensor !== sensorName),
    });
    logMessage(`[toggleSensor] Sensor ${sensorName} disabled`, "info");
  }
}

const NORDIC_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_RX_CHARACTERISTIC = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_TX_CHARACTERISTIC = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

NRF.setServices(
  {
    [NORDIC_SERVICE]: {
      [NORDIC_TX_CHARACTERISTIC]: {
        notify: true,
        readable: true,
        writable: true,
        indicate: true,
      },
      [NORDIC_RX_CHARACTERISTIC]: {
        value: "",
        readable: true, // optional, default is false
        writable: true, // optional, default is false
        notify: true, // optional, default is false
        indicate: true, // optional, default is false
        description: "My Characteristic", // optional, default is null,
        security: {
          // optional - see NRF.setSecurity
          read: {
            // optional
            encrypted: false, // optional, default is false
            mitm: false, // optional, default is false
            lesc: false, // optional, default is false
            signed: false, // optional, default is false
          },
          write: {
            // optional
            encrypted: false, // optional, default is false
            mitm: false, // optional, default is false
            lesc: false, // optional, default is false
            signed: false, // optional, default is false
          },
        },
        onConnect: () => {
          console.log("Connected to device");
        },
        onWrite: (evt) => {
          console.log("onWrite", evt);
          logMessage(`[onWrite] ${evt.value}`, "info");

          try {
            let dataStr = "";
            for (let i = 0; i < evt.value.length; i++) {
              dataStr += String.fromCharCode(evt.value[i]);
            }

            const message = JSON.parse(dataStr);
            logMessage(`[onWrite] ${JSON.stringify(message)}`, "info");
            console.log("Received message:", message);

            if (message.pid !== undefined) {
              // Update the settings
              const currentSettings = getAppSettings();
              currentSettings.pid = message.pid.toString().padStart(2, "0");
              require("Storage").writeJSON("clinikali.json", currentSettings);
              console.log("Updated PID to:", currentSettings.pid);
              logMessage(
                `[onWrite] Updated PID to: ${currentSettings.pid}`,
                "info",
              );

              // Optional: Reload widget if needed
              if (WIDGETS["clinikali"]) {
                WIDGETS["clinikali"].reload();
              }
            }
          } catch (err) {
            console.log("Error processing message:", err);
          }
        },
      },
    },
  },
  { advertise: ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"] },
);

/**
 * @param {string} fileName
 *
 * @returns {MenuInstance}
 */
function sendCsvFile(fileName) {
  console.log("Starting file send:", fileName);

  const file = require("Storage").open(fileName, "r");
  const fileLength = file.getLength();
  console.log("File length:", fileLength);

  if (fileLength === 0) {
    console.log("Empty file!");
    return;
  }

  const content = file.read(fileLength);
  console.log("Read content length:", content ? content.length : 0);

  const dataToSend = JSON.stringify({
    t: "file",
    n: fileName,
    c: content,
    timestamp: Date.now(),
  });

  NRF.connect("e8:f7:91:fb:61:db public", {})
    .then((gatt) => {
      console.log("Connected to device");

      // Find the Nordic UART service
      let nordicService = gatt.getPrimaryService(
        "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
      );
      return nordicService.then((service) => {
        console.log("Found Nordic service");
        // Get the TX characteristic
        return service.getCharacteristic(
          "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
        );
      });
    })
    .then((txChar) => {
      console.log("Found TX characteristic");

      // Send data in chunks
      const chunkSize = 100;
      let position = 0;

      function sendNextChunk() {
        if (position >= dataToSend.length) {
          console.log("All data sent");
          return;
        }

        const chunk = dataToSend.slice(position, position + chunkSize);
        txChar.writeValue(chunk).then(() => {
          console.log(
            `Sent chunk ${Math.floor(position / chunkSize) + 1} of ${Math.ceil(
              dataToSend.length / chunkSize,
            )}`,
          );
          position += chunkSize;
          sendNextChunk();
        });
      }

      sendNextChunk();
    })
    .catch((err) => console.log("Error:", err));
}

/**
 * @param {string} fileName
 *
 * @returns {MenuInstance}
 */
function showFileMenu(fileName) {
  /** @type {Menu} */
  const menu = {
    "": { title: fileName.split("_")[1] },
    Delete: () => {
      E.showPrompt("Confirm delete").then((shouldDelete) => {
        if (!shouldDelete) {
          return showFileMenu(fileName);
        }

        const file = getAppSettings()["file"];

        if (file === fileName) {
          updateAppSettings({ file: "" });
        }

        updateAppSettings({ isRecording: false });
        require("Storage").open(fileName, "r").erase();
        logMessage(`[showFileMenu] File ${fileName} deleted`, "info");

        return showFilesMenu();
      });
    },
    Send: () => {
      sendCsvFile(fileName);
    },
    "< Back": () => showFilesMenu(),
  };

  return E.showMenu(menu);
}

/**
 * @returns {MenuInstance}
 */
function showFilesMenu() {
  /** @type {Menu} */
  const menu = {
    "": { title: "Files" },
  };

  const fileList = require("Storage")
    .list(/\d+_\d+-\d+-\d+\.csv/, { sf: true })
    .reverse();

  if (fileList.length === 0) {
    menu["No files found"] = () => {};
  } else {
    fileList.forEach(
      (filename) =>
        (menu[filename.split("_")[1]] = () => showFileMenu(filename)),
    );
  }

  menu["< Back"] = () => showMainMenu();

  return E.showMenu(menu);
}

/**
 * @returns {MenuInstance}
 */
function showMainMenu() {
  /** @type {Menu} */
  const menu = {
    "": { title: "Clinikali" },
    "< Back": () => load(),
    Record: {
      onchange: () => toggleRecorder(),
      value: getAppSettings()["isRecording"],
    },
    Sensors: () => showSensorsMenu(),
    Period: {
      format: (/** @type {number} */ value) => `${value} Hz`,
      onchange: (/** @type {number} */ newValue) =>
        handleTimePeriodChange(newValue),
      max: 60,
      min: 1,
      step: 1,
      value: getAppSettings()["timePeriod"],
    },
    "View files": () => showFilesMenu(),
  };

  return E.showMenu(menu);
}

/**
 * @returns {MenuInstance}
 */
function showSensorsMenu() {
  const enabledSensors = getAppSettings()["enabledSensors"];

  /** @type {Menu} */
  const menu = {
    "": { title: "Sensors" },
    Accelerometer: {
      onchange: () => toggleSensor("accel"),
      value: enabledSensors.includes("accel"),
    },
    "Heart rate": {
      onchange: () => toggleSensor("hrm"),
      value: enabledSensors.includes("hrm"),
    },
    Temperature: {
      onchange: () => toggleSensor("baro"),
      value: enabledSensors.includes("baro"),
    },
    "< Back": () => showMainMenu(),
  };

  return E.showMenu(menu);
}

updateAppSettings(getAppSettings());
showMainMenu();
