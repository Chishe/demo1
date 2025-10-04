const verticalLinePlugin = {
  id: "verticalLinePlugin",
  afterDraw: (chart) => {
    if (!chart.tooltip?.active || !chart.tooltip.dataPoints?.length) return;
    const ctx = chart.ctx;
    const x = chart.tooltip.dataPoints[0].element.x;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chart.chartArea.top);
    ctx.lineTo(x, chart.chartArea.bottom);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "gray";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

let chart;
let timerSeconds;
let seconds = 0;
let actual = 0;
let isStarted = false;
let stationId = "";
let alarm1Inserted = false;
let alarm2Inserted = false;

function getStationId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("id") || "default";
}

document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("userData"));

  if (!user) {
    window.location.href = "/";
    return;
  }

  document.getElementById(
    "userName"
  ).innerText = `${user.firstname} ${user.lastname}`;

  stationId = getStationId();
  document.getElementById("stationName").innerText = stationId;

  initChart();

  const storedSeconds =
    parseInt(localStorage.getItem(`station_seconds_${stationId}`)) || 0;
  const storedIsStarted =
    localStorage.getItem(`station_isStarted_${stationId}`) === "true";

  if (storedIsStarted) {
    seconds = storedSeconds;
    isStarted = true;
    startStation(true);
    fetchActual().then(() => {
      chart.data.labels.push((seconds / 60).toFixed(1));
      chart.data.datasets[0].data.push(actual);
      chart.update();
    });
  } else {
    seconds = storedSeconds;
    document.getElementById("timeStart").value = formatTime(seconds);
  }

  loadLogs(); // เรียกตอน DOM โหลดเสร็จ
});

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

async function fetchActual() {
  try {
    const res = await fetch(`/api/station/${stationId}`);
    const data = await res.json();
    if (data && data.length > 0) {
      actual = data[data.length - 1].actual; // ดึงค่าล่าสุด
    }
  } catch (err) {
    console.error(err);
  }
}

async function startStation(resume = false) {
  if (isStarted && !resume) {
    Swal.fire("Station กำลังทำงานอยู่ ต้องกด Reset ก่อนเริ่มใหม่");
    return;
  }

  if (!resume) {
    seconds = 0;
    actual = 0;
    document.getElementById("timeStart").value = "0";
    initChart(
      document.getElementById("alarm1").value,
      document.getElementById("alarm2").value
    );
  }

  timerSeconds = setInterval(async () => {
    seconds++;
    document.getElementById("timeStart").value = formatTime(seconds);
    localStorage.setItem(`station_seconds_${stationId}`, seconds);

    const alarm1 = parseInt(document.getElementById("alarm1").value);
    const alarm2 = parseInt(document.getElementById("alarm2").value);

    const alarm1Value = isNaN(alarm1) ? Infinity : alarm1;
    const alarm2Value = isNaN(alarm2) ? Infinity : alarm2;

    if (!alarm1Inserted && seconds >= alarm1Value) {
      alarm1Inserted = true;
      localStorage.setItem(`alarm1Inserted_${stationId}`, "true");
      await insertStationLog(alarm1Value, alarm2Value, "alarm_1");
    }

    if (!alarm2Inserted && seconds >= alarm2Value) {
      alarm2Inserted = true;
      localStorage.setItem(`alarm2Inserted_${stationId}`, "true");
      await insertStationLog(alarm1Value, alarm2Value, "alarm_2");
    }

    if (seconds % 60 === 0) {
      await fetchActual();
      actual++;
      chart.data.labels.push((seconds / 60).toFixed(1));
      chart.data.datasets[0].data.push(actual);
      chart.update();
    }
  }, 1000);

  isStarted = true;
  localStorage.setItem(`station_isStarted_${stationId}`, "true");

  if (!resume) {
    Swal.fire({
      icon: "success",
      title: "Started",
      text: `Station ${stationId} เริ่มทำงานแล้ว!`,
    });
  }
}

function resetStation() {
  Swal.fire({
    title: "คุณแน่ใจหรือไม่?",
    text: `ต้องการ Reset station ${stationId} นี้หรือไม่`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ใช่, Reset",
    cancelButtonText: "ยกเลิก",
  }).then((result) => {
    if (!result.isConfirmed) return;

    clearInterval(timerSeconds);

    seconds = 0;
    actual = 0;
    isStarted = false;
    alarm1Inserted = false;
    alarm2Inserted = false;
    localStorage.setItem(`alarm1Inserted_${stationId}`, "false");
    localStorage.setItem(`alarm2Inserted_${stationId}`, "false");
    document.getElementById("timeStart").value = "0";

    localStorage.removeItem(`station_seconds_${stationId}`);
    localStorage.setItem(`station_isStarted_${stationId}`, "false");

    initChart(
      document.getElementById("alarm1").value,
      document.getElementById("alarm2").value
    );

    Swal.fire({
      icon: "info",
      title: "Reset",
      text: `รีเซ็ตค่า Time Start และกราฟของ ${stationId} เรียบร้อยแล้ว`,
    });
  });
}

async function insertStationLog(alarm1, alarm2, status) {
  try {
    const user = JSON.parse(localStorage.getItem("userData"));

    const res = await fetch("/api/station-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seconds: seconds,
        alarm_1: alarm1 * 60,
        alarm_2: alarm2 * 60,
        station: stationId,
        status: status,
        userlog: `${user.firstname} ${user.lastname}`,
      }),
    });

    if (!res.ok) throw new Error("Failed to insert log");
    console.log(`Log inserted: ${status}`);
  } catch (err) {
    console.error(err);
  }
}

function initChart(alarm1 = null, alarm2 = null) {
  const ctx = document.getElementById("myChart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Actual",
          data: [],
          borderColor: "#AAFF00",
          borderWidth: 2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { position: "top" },
        title: { display: true, text: `Station Monitor - ${stationId}` },
        annotation: {
          annotations: {
            ...(alarm1
              ? {
                  alarm1: {
                    type: "line",
                    yMin: alarm1,
                    yMax: alarm1,
                    borderColor: "red",
                    borderWidth: 2,
                    borderDash: [6, 6],
                    label: {
                      enabled: true,
                      content: "Alarm 1",
                      position: "end",
                    },
                  },
                }
              : {}),
            ...(alarm2
              ? {
                  alarm2: {
                    type: "line",
                    yMin: alarm2,
                    yMax: alarm2,
                    borderColor: "orange",
                    borderWidth: 2,
                    borderDash: [4, 4],
                    label: {
                      enabled: true,
                      content: "Alarm 2",
                      position: "end",
                    },
                  },
                }
              : {}),
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Time (min)" },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: "Value" },
          grid: { display: false },
        },
      },
    },
    plugins: [verticalLinePlugin],
  });
}

async function saveThreshold() {
  if (localStorage.getItem(`station_isStarted_${stationId}`) === "true") {
    Swal.fire(
      "ต้อง Reset ก่อน",
      "คุณต้องกด Reset ก่อนบันทึก Threshold",
      "warning"
    );
    return;
  }

  const alarm1 = document.getElementById("alarm1").value;
  const alarm2 = document.getElementById("alarm2").value;

  await fetch("/api/station-threshold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      station: stationId,
      alarm_1: Number(alarm1) * 60,
      alarm_2: Number(alarm2) * 60,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      console.log(data);
      loadThreshold();
      Swal.fire("บันทึกสำเร็จ", `สถานะ: ${data.status}`, "success");
    })
    .catch((err) => {
      console.error(err);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้", "error");
    });
}

async function loadThreshold() {
  if (!stationId) return;

  try {
    const res = await fetch(`/api/station-threshold/${stationId}`);
    console.log(stationId, res);
    if (!res.ok) throw new Error("ไม่พบข้อมูล");

    const data = await res.json();

    document.getElementById("alarm1").value = data.alarm_1 / 60 ?? "";
    document.getElementById("alarm2").value = data.alarm_2 / 60 ?? "";
  } catch (err) {
    console.error(err);
    document.getElementById("alarm1").value = "";
    document.getElementById("alarm2").value = "";
  }
}

function updateTimeStartEffect() {
  const timeStart = document.getElementById("timeStart");
  const alarm1 =
    parseFloat(document.getElementById("alarm1").value) || Infinity;
  const alarm2 =
    parseFloat(document.getElementById("alarm2").value) || Infinity;
  const timeValue = parseFloat(timeStart.value) || 0;

  timeStart.classList.remove("shake", "glow");

  if (timeValue >= alarm1) {
    timeStart.style.color = "red";
    timeStart.classList.add("shake");
  } else if (timeValue >= alarm2) {
    timeStart.style.color = "yellow";
    timeStart.classList.add("glow");
  } else {
    timeStart.style.color = "#00ff00";
  }
}

async function loadStation(stationId) {
  document.getElementById("stationName").innerText = stationId;
  const res = await fetch(`/api/station/${stationId}`);

  const data = await res.json();

  const tbody = document.getElementById("logsTable");
  tbody.innerHTML = "";
  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" class="text-center text-muted">ยังไม่มีข้อมูล</td>`;
    tbody.appendChild(tr);
    return;
  }
  data.forEach((row) => {
    let rowClass = "table-success";

    const actual = parseFloat(row.actual);
    const alarm1 = parseFloat(row.alarm_1);
    const alarm2 = parseFloat(row.alarm_2);
    const remark = row.remark || "0";
    if (remark === "1") {
      rowClass = "table-info";
    } else if (actual > alarm1 && actual > alarm2) {
      rowClass = "table-danger";
    } else if (actual > alarm2) {
      rowClass = "table-warning";
    }

    const tr = document.createElement("tr");
    tr.className = rowClass;
    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${row.station}</td>
      <td>${row.actual}</td>
      <td>${row.alarm_1}</td>
      <td>${row.alarm_2}</td>
      <td>${row.status || ""}</td>
      <td>${row.remark || "0"}</td>
      <td>${row.detail || ""}</td>
      <td>${row.created_at}</td>
      <td>
        

        <div class="tooltip-container">
            <button class="btn btn-sm btn-primary" onclick="remark(${
              row.id
            })"><img src="../picture/remark.png" alt="remark" class="btn-img"/></button>
                  <span class="tooltip-content left">กดเพื่อกรอกหมายเหตุ</span>
                </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function remark(id) {
  const confirm = await Swal.fire({
    title: "ต้องการ Remark ใช่หรือไม่?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "ใช่",
    cancelButtonText: "ไม่",
  });

  if (confirm.isConfirmed) {
    const { value: detail } = await Swal.fire({
      title: "กรอกรายละเอียด",
      input: "textarea",
      inputPlaceholder: "พิมพ์รายละเอียดที่นี่...",
      showCancelButton: true,
    });

    if (detail) {
      await fetch(`/api/station-remark/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detail }),
      });

      Swal.fire("สำเร็จ", "บันทึก Remark แล้ว", "success");
      loadLogs();
    }
  }
}

function loadLogs() {
  const stationId = document.getElementById("stationName").innerText;
  loadStation(stationId);
}

document.getElementById("exportCsvBtn").addEventListener("click", function () {
  let table = document.querySelector("table");
  let rows = Array.from(table.querySelectorAll("tr"));
  let csv = rows
    .map((row) => {
      let cells = Array.from(row.querySelectorAll("th, td"));
      return cells
        .map((cell) => `"${cell.innerText.replace(/"/g, '""')}"`)
        .join(",");
    })
    .join("\n");

  let blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  let link = document.createElement("a");
  let url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", "table_export.csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
window.addEventListener("DOMContentLoaded", loadThreshold);
updateTimeStartEffect();

setInterval(() => {
  updateTimeStartEffect();
}, 500);

function logout() {
  localStorage.removeItem("userData");
  // ❌ ไม่ลบ station_seconds_* เพราะต้องการให้แต่ละ station จำค่าแยกกัน
  window.location.href = "/";
}
