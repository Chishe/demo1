document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("userData"));

  if (!user) {
    window.location.href = "/";
    return;
  }

  document.getElementById(
    "userName"
  ).innerText = `${user.firstname} ${user.lastname}`;

  const clickableParents = [
    "parent1",
    "parent2",
    "parent9",
    "parent11",
    "parent12",
  ];

  clickableParents.forEach((parentClass) => {
    const parent = document.querySelector(`.${parentClass}`);
    if (!parent) return;

    parent.addEventListener("click", (e) => {
      const div = e.target.closest("div[data-station]");
      if (div) {
        const areaName = div.dataset.station;
        localStorage.setItem("selectedArea", areaName);
        window.location.href = `/station.html?id=${div.dataset.station}`;
      }
    });
  });

  const updatableParents = [
    "parent1",
    "parent2",
    "parent9",
    "parent12",
    "parent11",
  ];

  updatableParents.forEach((parentClass) => {
    checkAndUpdateStations(parentClass);
  });

  setInterval(() => {
    updatableParents.forEach((parentClass) => {
      checkAndUpdateStations(parentClass);
    });
  }, 5000);
});

async function checkAndUpdateStations(parentClass) {
  const parent = document.querySelector(`.${parentClass}`);
  if (!parent) return;

  const divs = parent.querySelectorAll("div[data-station]");

  for (const div of divs) {
    const stationName = div.dataset.station;

    try {
      const res = await fetch(`/api/station-status/${stationName}`);
      const data = await res.json();

      div.classList.remove("bg-success", "bg-warning", "bg-danger");
      div.classList.remove("tooltip-container-dashboard"); // ลบ class เก่า
      div.innerHTML = ""; // เคลียร์ข้อความเดิม

      const statusClass = data.statusClass || "bg-success";
      div.classList.add(statusClass);

      const actual = data.actual != null ? data.actual : 0;
      div.innerText = `${stationName} (${actual})`;

      // ถ้าสถานะเป็น warning หรือ danger ให้ทำ tooltip
      if (statusClass === "bg-warning" || statusClass === "bg-danger") {
        const tooltipText = statusClass === "bg-warning"
          ? "อยากให้มีครั้งที่2"
          : "อยากให้มีครั้งที่3";

        // ทำให้ div กลายเป็น tooltip-container
        div.classList.add("tooltip-container-dashboard");

        // สร้าง tooltip element
        const tooltip = document.createElement("span");
        tooltip.classList.add("tooltip-content-dashboard", "top");
        tooltip.innerText = tooltipText;

        div.appendChild(tooltip);
        div.classList.add("show-tooltip-dashboard"); // ทำให้ tooltip ค้าง
      }

    } catch (err) {
      console.error(`Error loading ${stationName}:`, err);

      div.classList.remove("bg-success", "bg-warning", "bg-danger");
      div.classList.add("bg-success");
      div.innerText = `${stationName} (0)`;
    }
  }
}

function logout() {
  localStorage.removeItem("userData");
  window.location.href = "/";
}
