const seedParts = [
  ["NESPL-1001", "Connector Housing 6P", 50, 35, "B1-01", 42],
  ["NESPL-1002", "Terminal Pin", 100, 80, "B1-03", 24],
  ["NESPL-1003", "Wire Seal", 75, 60, "B2-01", 8],
  ["NESPL-1004", "Connector Housing 14P", 40, 32, "B2-03", 55],
  ["NESPL-1005", "Cable Tie", 200, 180, "B1-03", 125],
  ["NESPL-1006", "Relay 12V", 30, 20, "B1-02", 18],
  ["NESPL-1007", "Fuse 10A", 50, 25, "B1-01", 5],
  ["NESPL-1008", "PCB Assembly", 30, 20, "B2-02", 34],
  ["NESPL-1009", "Bracket", 60, 55, "B2-01", 29],
  ["NESPL-1010", "Screw M3", 100, 70, "B1-03", 76],
  ["NESPL-1011", "Washer", 150, 120, "B2-03", 62],
  ["NESPL-1012", "Nut M3", 150, 120, "B1-01", 12]
];

let parts = (JSON.parse(localStorage.getItem("novotekParts") || "null") || seedParts).map((part) => part.length > 5 ? part : [...part, seedParts.find((seedPart) => seedPart[0] === part[0])?.[5] ?? 0]);
let history = JSON.parse(localStorage.getItem("novotekHistory") || "[]");
let lastSavedAt = localStorage.getItem("novotekLastSync") || "";
let settings = JSON.parse(localStorage.getItem("novotekSettings") || '{"operator":"Suresh Kumar","com":"COM5","baud":"9600"}');
if (settings.com === "COM3" && Number(settings.baud) === 9600) settings.com = "COM5";
let hardwareStatus = { state: "offline", port: settings.com, baudRate: Number(settings.baud), message: "Waiting for desktop app" };
let hardwareStatusListenerAttached = false;
let hardwareDataListenerAttached = false;
let hardwareRxFrames = [];
let boms = JSON.parse(localStorage.getItem("novotekBoms") || "null") || [{
  id: "BOM-001",
  number: "BOM - 001",
  name: "Harness Assembly",
  description: "Harness Assembly",
  items: parts.map((part) => ({ partNumber: part[0], quantity: part[2] }))
}];
let bomNumberSequence = Number(localStorage.getItem("novotekBOMNumberSequence")) || 0;
const unnumberedBoms = [];
boms.forEach((bom) => {
  const numberMatch = String(bom.number || bom.name).match(/BOM\s*-\s*(\d+)/i);
  const legacyNameMatch = String(bom.name).match(/^\s*BOM\s*-\s*\d+\s*\((.+)\)\s*$/i);
  if (!bom.number && numberMatch) bom.number = `BOM - ${String(numberMatch[1]).padStart(3, "0")}`;
  else if (!bom.number) unnumberedBoms.push(bom);
  if (legacyNameMatch) bom.name = legacyNameMatch[1].trim();
  bomNumberSequence = Math.max(bomNumberSequence, Number(String(bom.number || "").match(/(\d+)$/)?.[1]) || 0);
});
unnumberedBoms.forEach((bom) => {
  bom.number = `BOM - ${String(++bomNumberSequence).padStart(3, "0")}`;
});
const productCategories = {
  "Smart Products": ["IoT", "Smart Switches", "WiFi Controller", "Pick to Light", "Smart Bin System"],
  "Electronic Assemblies": ["PCB Assembly", "Display Module", "Controller Box", "Text Box"],
  "Automotive Electronics": ["Wiring Harnesses", "LED Lamps", "Switches", "Instrument Cluster"],
  "Industrial Electronics": ["Controller Box", "PLC Panel"]
};
let selectedBOMId = boms[0]?.id || "";
let selectedPart = "";
let checkedParts = new Set();
let orders = JSON.parse(localStorage.getItem("novotekOrders") || "null") || [{
  id: "SO-20250928-001",
  customer: "ABC Automotive",
  priority: "High",
  bomId: selectedBOMId,
  picked: Object.fromEntries(parts.map((part) => [part[0], part[3]]))
}];
let selectedOrderId = localStorage.getItem("novotekSelectedOrder") || orders[0]?.id || "";
let editingOrderId = "";
let editingBOMId = "";
let orderNumberSequence = Math.max(
  Number(localStorage.getItem("novotekOrderNumberSequence")) || 0,
  ...orders.map((order) => Number(order.id.match(/^NESPL\s*-\s*(\d+)$/i)?.[1]) || 0)
);
if (!orders.some((order) => order.id === selectedOrderId)) selectedOrderId = orders[0]?.id || "";
let pendingPartActionConfirmation = null;
let reportView = "all";
let reportMonth = "";
let reportFrom = "";
let reportTo = "";
let appliedReportFrom = "";
let appliedReportTo = "";
let reportRangeApplied = false;
let reportDraft = null;
const reportColumnFilters = {
  order: "",
  part: "",
  description: "",
  bin: "",
  operator: ""
};
let historyFilterView = "monthly";
let historyFilterMonth = "";
let historyFilterFrom = "";
let historyFilterTo = "";
let historyAppliedFrom = "";
let historyAppliedTo = "";
let historyFilterDraft = null;
const historyColumnFilters = { order: "", part: "", description: "", bin: "", operator: "" };
let themePreference = localStorage.getItem("novotekTheme") || "system";
if (!["system", "light", "dark"].includes(themePreference)) themePreference = "system";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const theme = themePreference === "system"
    ? (systemTheme.matches ? "dark" : "light")
    : themePreference;
  document.documentElement.dataset.theme = theme;
  document.getElementById("themeSelect").value = themePreference;
}

applyTheme();
document.getElementById("themeSelect").addEventListener("change", (event) => {
  themePreference = event.target.value;
  localStorage.setItem("novotekTheme", themePreference);
  applyTheme();
});
systemTheme.addEventListener("change", () => {
  if (themePreference === "system") applyTheme();
});

function save() {
  lastSavedAt = new Date().toISOString();
  localStorage.setItem("novotekParts", JSON.stringify(parts));
  localStorage.setItem("novotekHistory", JSON.stringify(history));
  localStorage.setItem("novotekSettings", JSON.stringify(settings));
  localStorage.setItem("novotekBoms", JSON.stringify(boms));
  localStorage.setItem("novotekBOMNumberSequence", String(bomNumberSequence));
  localStorage.setItem("novotekOrders", JSON.stringify(orders));
  localStorage.setItem("novotekOrderNumberSequence", String(orderNumberSequence));
  localStorage.setItem("novotekSelectedOrder", selectedOrderId);
  localStorage.setItem("novotekLastSync", lastSavedAt);
  syncPartDetailItemsFromParts();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function stats() {
  let req = parts.reduce((a, p) => a + p[2], 0);
  let pick = parts.reduce((a, p) => a + p[3], 0);

  return {
    req,
    pick,
    pending: req - pick,
    pct: req ? Math.round((pick / req) * 100) : 0
  };
}

function clock() {
  const now = new Date();
  document.getElementById("clockDate").textContent = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  document.getElementById("clockTime").textContent = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

setInterval(clock, 1000);
clock();

document.querySelectorAll(".nav").forEach((b) => b.onclick = () => go(b.dataset.page));


const app = document.getElementById("app");
const hardwareBridge = window.ptlHardware || window.ptlLocalHardware || null;

function hardwareStatusText() {
  if (hardwareStatus.state === "online") return "ONLINE - " + hardwareStatus.port + " OPEN";
  if (hardwareStatus.state === "connecting") return "CONNECTING - " + hardwareStatus.port;
  return "OFFLINE - " + (hardwareStatus.port || "NO PORT");
}

function updateHardwareStatus(nextStatus) {
  hardwareStatus = { ...hardwareStatus, ...nextStatus };
  const statusText = hardwareStatusText();
  const indicator = document.getElementById("systemOnlineIndicator");
  const statusCard = document.getElementById("systemStatusCard");
  const connectionLabel = document.getElementById("systemConnectionLabel");
  const deviceLabel = document.getElementById("systemDeviceLabel");
  const settingsNotice = document.getElementById("hardwareSettingsNotice");
  const state = hardwareStatus.state;
  if (indicator) indicator.className = "system-online-indicator " + state;
  if (statusCard) statusCard.className = "dashboard-status-online " + state;
  if (connectionLabel) connectionLabel.textContent = statusText;
  if (deviceLabel) deviceLabel.textContent = hardwareStatus.port ? "USB-RS485 adapter - " + hardwareStatus.port : "USB-RS485 adapter not selected";
  if (settingsNotice) {
    const detail = hardwareStatus.message ? " (" + hardwareStatus.message + ")" : "";
    settingsNotice.textContent = "USB-RS485 adapter port: " + statusText + " at " + hardwareStatus.baudRate + " baud" + detail +
      ". The receive monitor is active; picks remain simulated until the PCB protocol is confirmed.";
  }
}

function hardwareRxLogMarkup() {
  return hardwareRxFrames.map((frame) => `
    <div class="hardware-rx-entry">
      <time>${escapeHtml(frame.time || '')}</time>
      <code>${escapeHtml(frame.hex || '')}</code>
      <span>${escapeHtml(frame.ascii || '')}${frame.truncated ? ' ...' : ''}</span>
    </div>
  `).join('') || '<p class="hardware-rx-empty">No data received yet. The board may wait for a controller request.</p>';
}

function updateHardwareData(frame) {
  hardwareRxFrames.push(frame);
  if (hardwareRxFrames.length > 50) hardwareRxFrames.shift();
  const log = document.getElementById('hardwareRxLog');
  if (log) log.innerHTML = hardwareRxLogMarkup();
}

function clearHardwareRxLog() {
  hardwareRxFrames = [];
  const log = document.getElementById('hardwareRxLog');
  if (log) log.innerHTML = hardwareRxLogMarkup();
}
function connectHardware() {
  if (!hardwareBridge) {
    updateHardwareStatus({ state: "offline", port: settings.com, baudRate: Number(settings.baud), message: "Run the desktop app to access USB serial" });
    return;
  }
  if (!hardwareStatusListenerAttached) {
    hardwareBridge.onStatus(updateHardwareStatus);
    hardwareStatusListenerAttached = true;
  }
  if (!hardwareDataListenerAttached) {
    hardwareBridge.onData(updateHardwareData);
    hardwareDataListenerAttached = true;
  }
  hardwareBridge.getStatus().then(updateHardwareStatus).catch(() => {});
  hardwareBridge.connect({ port: settings.com, baudRate: Number(settings.baud) })
    .then(updateHardwareStatus)
    .catch((error) => updateHardwareStatus({ state: "offline", message: error.message }));
}

function loadSerialPorts() {
  if (!hardwareBridge) return;
  hardwareBridge.listPorts().then((ports) => {
    const list = document.getElementById("availableComPorts");
    if (!list) return;
    list.replaceChildren(...ports.map((port) => {
      const option = document.createElement("option");
      option.value = port.path;
      option.label = [port.path, port.manufacturer, port.friendlyName].filter(Boolean).join(" - ");
      return option;
    }));
  }).catch(() => {});
}

const dashboardReturnObserver = new MutationObserver(() => {
  const page = app.querySelector(".page");
  if (!page || page.classList.contains("dashboard-screen") || page.querySelector(".dashboard-return")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dashboard-return";
  button.textContent = "Back to Dashboard";
  button.setAttribute("aria-label", "Return to dashboard");
  button.addEventListener("click", () => go("dashboard"));
  page.prepend(button);
});
dashboardReturnObserver.observe(app, { childList: true, subtree: true });

function go(page) {
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  ({ dashboard: dashboard, active: activeOrder, parts: partsPage, partdetails: partDetailsPage, history: historyPage, reports: reportsPage, settings: settingsPage }[page] || dashboard)();
}

function currentBOM() {
  const order = currentOrder();
  return boms.find((bom) => bom.id === (order?.bomId || selectedBOMId)) || boms[0];
}

function currentOrder() {
  return orders.find((order) => order.id === selectedOrderId) || orders[0];
}

function priorityRank(priority) {
  return ({ Critical: 0, High: 1, Normal: 2, Low: 3 })[priority] ?? 4;
}

function prioritizedOrders() {
  return orders
    .map((order, index) => ({ order, index }))
    .sort((a, b) => priorityRank(a.order.priority) - priorityRank(b.order.priority) || a.index - b.index)
    .map(({ order }) => order);
}

function currentBOMItems() {
  const bom = currentBOM();
  return bom ? bom.items.map((item) => ({
    item,
    partIndex: parts.findIndex((part) => part[0] === item.partNumber)
  })).filter((entry) => entry.partIndex >= 0) : [];
}

function requiredQty(part) {
  const item = currentBOM()?.items.find((entry) => entry.partNumber === part[0]);
  return item ? item.quantity : part[2];
}

function pickedQty(part) {
  const order = currentOrder();
  return order && Object.prototype.hasOwnProperty.call(order.picked, part[0])
    ? order.picked[part[0]]
    : 0;
}

function orderStats() {
  const items = currentBOM()?.items || [];
  const req = items.reduce((total, item) => total + item.quantity, 0);
  const pick = items.reduce((total, item) => {
    const part = parts.find((candidate) => candidate[0] === item.partNumber);
    return total + (part ? Math.min(item.quantity, pickedQty(part)) : 0);
  }, 0);
  return {
    req,
    pick,
    pending: req - pick,
    overdue: 0,
    pct: req ? Math.round((pick / req) * 100) : 0,
    pickedPct: req ? (pick / req) * 100 : 0,
    pendingPct: req ? ((req - pick) / req) * 100 : 0
  };
}

function dashboard() {
  const s = orderStats();
  const bom = currentBOM();
  const order = currentOrder();

  app.innerHTML = `
    <div class="page dashboard-screen">
      <div class="page-title">Dashboard</div>
     
      <div class="cards order-cards">
        <div class="card">
          <h4>Current Order</h4>
          <select class="order-select" aria-label="Select current order" onchange="selectOrder(this.value)">
            ${prioritizedOrders().map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === order?.id ? "selected" : ""}>${escapeHtml(item.priority)} priority - ${escapeHtml(item.id)}</option>`).join("")}
          </select>
          <div class="order-management-actions">
            <button type="button" class="btn btn-small btn-secondary" onclick="openOrderForm('${escapeHtml(order?.id || "")}')" ${order ? "" : "disabled"}>EDIT ORDER</button>
            <button type="button" class="btn btn-small btn-secondary" onclick="deleteCurrentOrder()" ${order ? "" : "disabled"}>DELETE ORDER</button>
          </div>
          <p>Customer: ${escapeHtml(order?.customer || "No customer selected")}</p>
          <p>Priority: <strong>${escapeHtml(order?.priority || " - ")}</strong> &nbsp; | &nbsp; Pending: ${s.pending}</p>
          <button class="btn btn-small add-order-button" onclick="openOrderForm()">ADD NEW ORDER</button>
        </div>
        <div class="card order-progress-card">
          <h4>Order Progress</h4>
          <div class="order-progress-layout">
            <div
              class="progress-donut ${s.req ? "" : "empty"}"
              style="--picked-pct:${s.pickedPct}%;--pending-end:${s.pickedPct + s.pendingPct}%"
              role="img"
              aria-label="Order progress: ${s.pct}% picked, ${s.pick} units picked, ${s.pending} units pending, ${s.overdue} units overdue">
              <div class="progress-donut-center">
                <strong>${s.pct}%</strong>
                <span>complete</span>
              </div>
            </div>
            <div class="progress-summary">
              <div class="progress-legend">
                <div><span class="legend-dot picked-dot"></span><span>Picked</span><strong>${s.pick}</strong></div>
                <div><span class="legend-dot pending-dot"></span><span>Pending</span><strong>${s.pending}</strong></div>
                <div><span class="legend-dot overdue-dot"></span><span>Overdue</span><strong>${s.overdue}</strong></div>
              </div>
              <div class="progress-total">Total Units: <strong>${s.req}</strong></div>
              <div class="progress" aria-label="${s.pct}% of order picked">
                <i style="width:${s.pct}%"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="workspace">
        <div class="panel">
          <div class="tabs">
            <button class="active" onclick="openBOMForm()">BOM List</button>
            <button onclick="activeOrder()">Order List</button>
            <button onclick="customBOM()">Custom BOM</button>
            <button onclick="favorites()">Favorites</button>
          </div>
          <div class="toolbar">
            <select aria-label="Select BOM" onchange="selectBOM(this.value)">
              ${boms.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === bom?.id ? "selected" : ""}>${escapeHtml(item.number ? `${item.number} - ` : "")}${escapeHtml(item.name)}</option>`).join("")}
            </select>
            <button class="dashboard-toolbar-button" onclick="openBOMForm()">NEW BOM</button>
            <button class="dashboard-toolbar-button" onclick="openPartForm(null, 'dashboard')">ADD PART</button>
            <button type="button" class="dashboard-toolbar-button dashboard-toolbar-icon" aria-label="Edit BOM" title="Edit BOM" onclick="openBOMForm('${escapeHtml(bom?.id || "")}')" ${bom ? "" : "disabled"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg>
            </button>
            <button type="button" class="dashboard-toolbar-button dashboard-toolbar-icon" aria-label="Delete BOM" title="Delete BOM" onclick="deleteCurrentBOM()" ${bom ? "" : "disabled"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg>
            </button>
            <div class="qtybox">
              <button onclick="changeQty(-1)">-</button>
              <input id="bomQty" value="50">
              <button onclick="changeQty(1)">+</button>
            </div>
            <span>Nos</span>
          </div>
          ${bom ? `<div class="bom-description">${escapeHtml(bom.description)}</div>` : ""}
          ${partTable(true, false, "dashboard-table-scroll", true, "dashboard")}
          <div class="dashboard-table-count" role="status" aria-live="polite">
            Showing ${currentBOMItems().length} records
          </div>
        </div>
        <div class="dashboard-side-stack">
          ${pickPanel()}
          ${dashboardStatusPanel()}
        </div>
      </div>
    </div>
  `;
}

function selectBOM(id) {
  selectedBOMId = id;
  const order = currentOrder();
  if (order) {
    order.bomId = id;
    save();
  }
  selectedPart = "";
  checkedParts.clear();
  dashboard();
}

function selectOrder(id) {
  const order = orders.find((candidate) => candidate.id === id);
  if (!order) return;
  selectedOrderId = order.id;
  selectedBOMId = order.bomId;
  selectedPart = "";
  checkedParts.clear();
  save();
  dashboard();
}

function openOrderForm(orderId = "") {
  if (!boms.length) {
    alert("Create a BOM list before adding an order.");
    return;
  }

  const editingOrder = orders.find((order) => order.id === orderId);
  editingOrderId = editingOrder?.id || "";
  const orderNumber = editingOrder?.id || nextOrderNumber();
  const productType = productCategories[editingOrder?.productType] ? editingOrder.productType : "";
  const categories = productCategories[productType] || [];
  const productCategory = categories.includes(editingOrder?.productCategory) ? editingOrder.productCategory : "";

  document.getElementById("orderEditor")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="drawer-backdrop" id="orderEditor" onclick="closeOrderForm(event)">
      <section class="part-drawer" role="dialog" aria-modal="true" aria-labelledby="orderFormTitle" onclick="event.stopPropagation()">
        <div class="drawer-header">
          <div>
            <h2 id="orderFormTitle">${editingOrder ? "Edit Order" : "Add New Order"}</h2>
            <p>${editingOrder ? "Update the order details and product selection." : "Register an arriving order and choose its product type."}</p>
          </div>
          <button type="button" class="drawer-close" aria-label="Close" onclick="closeOrderForm()">&times;</button>
        </div>
        <form id="orderForm" class="part-form">
          <label for="orderNumber">Order Number</label>
          <input id="orderNumber" name="orderNumber" required maxlength="80" value="${escapeHtml(orderNumber)}" readonly>
          <label for="orderProjectNumber">Project Number</label>
          <input id="orderProjectNumber" name="projectNumber" maxlength="80" placeholder="Enter project number" value="${escapeHtml(editingOrder?.projectNumber || "")}">
          <label for="orderCustomer">Customer</label>
          <input id="orderCustomer" name="customer" required maxlength="120" placeholder="Customer name" value="${escapeHtml(editingOrder?.customer || "")}">
          <label for="orderPriority">Priority</label>
          <select id="orderPriority" name="priority" required>
            <option value="Critical" ${editingOrder?.priority === "Critical" ? "selected" : ""}>Critical</option>
            <option value="High" ${editingOrder?.priority === "High" ? "selected" : ""}>High</option>
            <option value="Normal" ${(!editingOrder || editingOrder.priority === "Normal") ? "selected" : ""}>Normal</option>
            <option value="Low" ${editingOrder?.priority === "Low" ? "selected" : ""}>Low</option>
          </select>
          <label for="orderProductType">Type of Product</label>
          <select id="orderProductType" name="productType" required onchange="updateOrderProductOptions()">
            <option value="" ${productType ? "" : "selected"} disabled>Select type of product</option>
            ${Object.keys(productCategories).map((type) => `<option value="${escapeHtml(type)}" ${type === productType ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
          </select>
          <label for="orderProductCategory">Product</label>
          <select id="orderProductCategory" name="productCategory" required ${productType ? "" : "disabled"}>
            <option value="" ${productCategory ? "" : "selected"} disabled>Select product</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}" ${category === productCategory ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
          </select>
          <p class="form-error" id="orderFormError" role="alert"></p>
          <div class="drawer-actions">
            <button type="button" class="btn btn-secondary" onclick="closeOrderForm()">CANCEL</button>
            <button type="submit" class="btn">${editingOrder ? "SAVE CHANGES" : "ADD ORDER"}</button>
          </div>
        </form>
      </section>
    </div>
  `);
  document.getElementById("orderForm").addEventListener("submit", saveOrderForm);
  document.getElementById("orderProjectNumber").focus();
}

function nextOrderNumber() {
  return `NESPL - ${String(orderNumberSequence + 1).padStart(4, "0")}`;
}

function updateOrderProductOptions(selectedCategory = "") {
  const type = document.getElementById("orderProductType").value;
  const select = document.getElementById("orderProductCategory");
  const categories = productCategories[type] || [];
  select.disabled = !categories.length;
  select.innerHTML = `<option value="" selected disabled>Select product</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  if (categories.includes(selectedCategory)) select.value = selectedCategory;
}

function closeOrderForm(event) {
  if (!event || event.target.id === "orderEditor") {
    document.getElementById("orderEditor")?.remove();
  }
}

function saveOrderForm(event) {
  event.preventDefault();
  const wasEditing = Boolean(editingOrderId);
  const id = document.getElementById("orderNumber").value.trim();
  const projectNumber = document.getElementById("orderProjectNumber").value.trim();
  const customer = document.getElementById("orderCustomer").value.trim();
  const priority = document.getElementById("orderPriority").value;
  const productType = document.getElementById("orderProductType").value;
  const productCategory = document.getElementById("orderProductCategory").value;
  const existingOrder = orders.find((order) => order.id === editingOrderId);
  const bomId = existingOrder?.bomId || currentBOM()?.id || selectedBOMId;
  const error = document.getElementById("orderFormError");

  if (!id || !customer || !productCategories[productType]?.includes(productCategory) || !boms.some((bom) => bom.id === bomId)) {
    error.textContent = "Enter an order number and customer, then select a valid product type and product.";
    return;
  }
  if (orders.some((order) => order.id.toLowerCase() === id.toLowerCase() && order.id !== editingOrderId)) {
    error.textContent = "That order number already exists.";
    return;
  }

  if (editingOrderId) {
    const order = orders.find((candidate) => candidate.id === editingOrderId);
    if (!order) return;
    order.id = id;
    order.customer = customer;
    order.priority = priority;
    order.bomId = bomId;
    order.productType = productType;
    order.productCategory = productCategory;
    order.projectNumber = projectNumber;
    if (selectedOrderId === editingOrderId) selectedOrderId = id;
  } else {
    orders.push({ id, customer, priority, bomId, productType, productCategory, picked: {} });
    orders[orders.length - 1].projectNumber = projectNumber;
    selectedOrderId = id;
    orderNumberSequence = Math.max(orderNumberSequence, Number(id.match(/^NESPL\s*-\s*(\d+)$/i)?.[1]) || 0);
  }
  selectedBOMId = orders.find((order) => order.id === selectedOrderId)?.bomId || bomId;
  editingOrderId = "";
  selectedPart = "";
  checkedParts.clear();
  save();
  document.getElementById("orderEditor").remove();
  dashboard();
  if (wasEditing) {
    showOrderConfirmation({
      title: "Order Updated",
      message: "The order details were updated successfully.",
      detail: id,
      confirmLabel: "OK"
    });
  }
}

function deleteCurrentOrder() {
  const order = currentOrder();
  if (!order) return;

  showOrderConfirmation({
    title: "Delete Order?",
    message: `Are you sure you want to delete order ${order.id}? This action cannot be undone.`,
    detail: order.id,
    confirmLabel: "Delete Order",
    danger: true,
    onConfirm: () => {
      orders = orders.filter((candidate) => candidate.id !== order.id);
      selectedOrderId = prioritizedOrders()[0]?.id || "";
      selectedBOMId = currentOrder()?.bomId || boms[0]?.id || "";
      selectedPart = "";
      checkedParts.clear();
      save();
      dashboard();
    }
  });
}

function showOrderConfirmation({ title, message, detail = "", confirmLabel = "OK", danger = false, onConfirm = null }) {
  document.getElementById("orderActionConfirmation")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="part-action-confirm-backdrop" id="orderActionConfirmation">
      <section class="part-action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="orderActionTitle" aria-describedby="orderActionMessage">
        <div class="part-action-confirm-icon ${danger ? "delete" : "edit"}" aria-hidden="true">
          ${danger
            ? '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>'}
        </div>
        <span class="part-action-confirm-step">${danger ? "CONFIRM ACTION" : "SAVED"}</span>
        <h2 id="orderActionTitle">${escapeHtml(title)}</h2>
        ${detail ? `<p class="part-action-confirm-part">${escapeHtml(detail)}</p>` : ""}
        <p id="orderActionMessage">${escapeHtml(message)}</p>
        <div class="part-action-confirm-buttons">
          ${danger ? '<button type="button" class="btn btn-secondary" data-cancel-order-action>Cancel</button>' : ""}
          <button type="button" class="btn ${danger ? "red" : ""}" data-confirm-order-action>${escapeHtml(confirmLabel)}</button>
        </div>
      </section>
    </div>
  `);
  const backdrop = document.getElementById("orderActionConfirmation");
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector("[data-cancel-order-action]")?.addEventListener("click", close);
  backdrop.querySelector("[data-confirm-order-action]").addEventListener("click", () => {
    close();
    onConfirm?.();
  });
  backdrop.querySelector("[data-confirm-order-action]").focus();
}

function bomItemRow(quantity = 1) {
  const options = parts.map((part) =>
    `<option value="${escapeHtml(part[0])}">${escapeHtml(part[0])}  -  ${escapeHtml(part[1])}</option>`
  ).join("");
  return `
    <div class="bom-item-row">
      <select class="bom-part-number" aria-label="BOM item part number" required>
        <option value="">Select a part number</option>
        ${options}
      </select>
      <input class="bom-item-quantity" type="number" aria-label="BOM item quantity" min="1" step="1" value="${quantity}" required>
      <button type="button" class="btn btn-small btn-secondary" aria-label="Remove item" onclick="this.closest('.bom-item-row').remove()">REMOVE</button>
    </div>
  `;
}

function openBOMForm(bomId = "") {
  const editingBOM = boms.find((bom) => bom.id === bomId);
  if (!parts.length && !editingBOM) {
    alert("Add at least one part before creating a BOM.");
    return;
  }

  editingBOMId = editingBOM?.id || "";
  const bomNumber = editingBOM?.number || nextBOMNumber();
  const bomRows = editingBOM?.items?.length
    ? editingBOM.items.map((item) => bomItemRow(item.quantity)).join("")
    : bomItemRow();

  document.getElementById("bomEditor")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="drawer-backdrop" id="bomEditor" onclick="closeBOMForm(event)">
      <section class="part-drawer bom-drawer" role="dialog" aria-modal="true" aria-labelledby="bomFormTitle" onclick="event.stopPropagation()">
        <div class="drawer-header">
          <div>
            <h2 id="bomFormTitle">${editingBOM ? "Edit BOM List" : "Create BOM List"}</h2>
            <p>${editingBOM ? "Update the list name, description, and parts." : "Give the list a name and description, then add its part numbers."}</p>
          </div>
          <button type="button" class="drawer-close" aria-label="Close" onclick="closeBOMForm()">&times;</button>
        </div>
        <form id="bomForm" class="part-form bom-form">
          <label for="bomNumber">BOM List Number</label>
          <input id="bomNumber" name="bomNumber" value="${escapeHtml(bomNumber)}" readonly>
          <label for="bomName">BOM List Name</label>
          <input id="bomName" name="bomName" required maxlength="100" placeholder="Enter BOM list name" value="${escapeHtml(editingBOM?.name || "")}">
          <label for="bomDescription">Description</label>
          <textarea id="bomDescription" name="description" required maxlength="300" rows="3" placeholder="Describe what this BOM is for">${escapeHtml(editingBOM?.description || "")}</textarea>
          <div class="bom-items-heading">
            <strong>Items and Part Numbers</strong>
            <button type="button" class="btn btn-small" onclick="addBOMItemRow()">ADD ITEM</button>
          </div>
          <div id="bomItems" class="bom-items">${bomRows}</div>
          <p class="form-error" id="bomFormError" role="alert"></p>
          <div class="drawer-actions">
            <button type="button" class="btn btn-secondary" onclick="closeBOMForm()">CANCEL</button>
            <button type="submit" class="btn">${editingBOM ? "SAVE CHANGES" : "SAVE BOM LIST"}</button>
          </div>
        </form>
      </section>
    </div>
  `);
  if (editingBOM) {
    document.querySelectorAll("#bomItems .bom-item-row").forEach((row, index) => {
      row.querySelector(".bom-part-number").value = editingBOM.items[index]?.partNumber || "";
    });
  }
  document.getElementById("bomForm").addEventListener("submit", saveBOMForm);
  document.getElementById("bomName").focus();
}

function addBOMItemRow() {
  document.getElementById("bomItems").insertAdjacentHTML("beforeend", bomItemRow());
}

function nextBOMNumber() {
  return `BOM - ${String(bomNumberSequence + 1).padStart(3, "0")}`;
}

function closeBOMForm(event) {
  if (!event || event.target.id === "bomEditor") {
    document.getElementById("bomEditor")?.remove();
  }
}

function saveBOMForm(event) {
  event.preventDefault();
  const wasEditing = Boolean(editingBOMId);
  const bomNumber = document.getElementById("bomNumber").value.trim();
  const name = document.getElementById("bomName").value.trim();
  const description = document.getElementById("bomDescription").value.trim();
  const error = document.getElementById("bomFormError");
  const items = [...document.querySelectorAll(".bom-item-row")].map((row) => ({
    partNumber: row.querySelector(".bom-part-number").value,
    quantity: Number(row.querySelector(".bom-item-quantity").value)
  }));
  const duplicateName = boms.some((bom) => bom.name.toLowerCase() === name.toLowerCase() && bom.id !== editingBOMId);
  const duplicatePart = new Set(items.map((item) => item.partNumber)).size !== items.length;

  if (!name || !description || !items.length || items.some((item) => !item.partNumber || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    error.textContent = "Enter a name, description, and at least one part number with a whole-number quantity greater than zero.";
    return;
  }
  if (duplicateName) {
    error.textContent = "A BOM with that name already exists.";
    return;
  }
  if (duplicatePart) {
    error.textContent = "Each part number can only appear once in a BOM list.";
    return;
  }

  let id = editingBOMId;
  if (editingBOMId) {
    const bom = boms.find((entry) => entry.id === editingBOMId);
    if (!bom) return;
    bom.name = name;
    bom.number = bomNumber;
    bom.description = description;
    bom.items = items;
  } else {
    id = `BOM-${Date.now()}`;
    while (boms.some((bom) => bom.id === id)) id = `BOM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    boms.push({ id, number: bomNumber, name, description, items });
  }
  bomNumberSequence = Math.max(bomNumberSequence, Number(bomNumber.match(/(\d+)$/)?.[1]) || 0);
  selectedBOMId = id;
  editingBOMId = "";
  selectedPart = "";
  checkedParts.clear();
  save();
  document.getElementById("bomEditor").remove();
  dashboard();
  if (wasEditing) {
    showOrderConfirmation({
      title: "BOM Updated",
      message: "The BOM list was updated successfully.",
      detail: name,
      confirmLabel: "OK"
    });
  }
}

function deleteCurrentBOM() {
  const bom = currentBOM();
  if (!bom) return;
  const replacementBOM = boms.find((candidate) => candidate.id !== bom.id);

  showOrderConfirmation({
    title: "Delete BOM List?",
    message: `Are you sure you want to delete ${bom.name}? Orders using this list will be moved to ${replacementBOM?.name || "no BOM list"}. This action cannot be undone.`,
    detail: bom.name,
    confirmLabel: "Delete BOM",
    danger: true,
    onConfirm: () => {
      boms = boms.filter((candidate) => candidate.id !== bom.id);
      orders.forEach((order) => {
        if (order.bomId === bom.id) order.bomId = replacementBOM?.id || "";
      });
      selectedBOMId = replacementBOM?.id || "";
      selectedPart = "";
      checkedParts.clear();
      save();
      dashboard();
    }
  });
}

function changeQty(n) {
  let x = document.getElementById("bomQty");
  x.value = Math.max(1, +x.value + n);
}

function partTable(openDetailsInPlace = false, rowOpensDetails = openDetailsInPlace, wrapperClass = "", manageParts = false, returnPage = "dashboard") {
  const items = currentBOMItems();
  const selectPartAction = openDetailsInPlace
    ? "openActiveOrderPartDetail"
    : "selectPartAt";
  const rowAction = rowOpensDetails ? selectPartAction : "selectPartAt";
  return `
    <div class="table-wrap ${wrapperClass}">
      <table class="data">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Part Number</th>
            <th>Description</th>
            <th>Required Qty</th>
            <th>Picked</th>
            <th>Pending</th>
            <th>Status</th>
            <th>Action</th>
            <th>Select</th>
            ${manageParts ? "<th>Manage</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${items.map(({ item, partIndex }, i) => {
            const p = parts[partIndex];
            const required = item.quantity;
            const picked = pickedQty(p);
            const pending = Math.max(0, required - picked);
            const status = pending === 0 ? "completed" : picked > 0 ? "in-progress" : "pending";
            const action = status === "completed" ? "View" : "Open";
            return `
              <tr class="${p[0] === selectedPart ? 'selected' : ''}" onclick="${rowAction}(${partIndex})">
                <td>${i + 1}</td>
                <td>${escapeHtml(p[0])}</td>
                <td>${escapeHtml(p[1])}</td>
                <td>${required}</td>
                <td>${picked}</td>
                <td>${pending}</td>
                <td><span class="order-status ${status}">${status === "completed" ? "COMPLETED" : status === "in-progress" ? "IN PROGRESS" : "PENDING"}</span></td>
                <td>
                  <button type="button" class="btn table-action ${action === "View" ? "view-action" : ""}" onclick="event.stopPropagation(); ${selectPartAction}(${partIndex})">${action}</button>
                </td>
                <td>
                  <input
                    class="part-checkbox"
                    type="checkbox"
                    aria-label="Select ${escapeHtml(p[0])} for picking"
                    ${checkedParts.has(p[0]) ? "checked" : ""}
                    onclick="event.stopPropagation()"
                    onchange="togglePartSelectionAt(${partIndex}, this.checked)"
                  >
                </td>
                ${manageParts ? `
                  <td class="part-row-actions">
                    <button type="button" class="part-row-icon-button edit" aria-label="Edit ${escapeHtml(p[0])}" title="Edit part" onclick="event.stopPropagation(); openManagedPartEdit('${escapeHtml(p[0])}', '${returnPage}')">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg>
                    </button>
                    <button type="button" class="part-row-icon-button delete" aria-label="Delete ${escapeHtml(p[0])}" title="Delete part" onclick="event.stopPropagation(); confirmManagedPartDelete('${escapeHtml(p[0])}', '${returnPage}')">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg>
                    </button>
                  </td>
                ` : ""}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function openActiveOrderPartDetail(index) {
  const part = parts[index];
  if (!part) return;

  const order = currentOrder();
  const required = order?.bomId
    ? currentBOM()?.items.find((item) => item.partNumber === part[0])?.quantity ?? part[2]
    : part[2];
  const picked = pickedQty(part);
  const pending = Math.max(0, required - picked);
  const status = pending === 0 ? "COMPLETED" : picked > 0 ? "IN PROGRESS" : "PENDING";
  const statusClass = pending === 0 ? "completed" : picked > 0 ? "in-progress" : "pending";

  document.getElementById("activeOrderPartDetail")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="active-part-detail-backdrop" id="activeOrderPartDetail" onclick="closeActiveOrderPartDetail(event)">
      <section class="active-part-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="activePartDetailTitle">
        <header class="active-part-detail-header">
          <div>
            <span class="active-part-detail-eyebrow">ACTIVE ORDER PART</span>
            <h2 id="activePartDetailTitle">${escapeHtml(part[0])}</h2>
            <p>${escapeHtml(part[1])}</p>
          </div>
          <button type="button" class="drawer-close" aria-label="Close part details" data-close-active-order-detail>&times;</button>
        </header>
        <div class="active-part-detail-content">
          <div class="active-part-detail-fields">
            <div class="active-part-detail-field"><span>Order</span><strong>${escapeHtml(order?.id || " - ")}</strong></div>
            <div class="active-part-detail-field"><span>Customer</span><strong>${escapeHtml(order?.customer || " - ")}</strong></div>
            <div class="active-part-detail-field"><span>Priority</span><strong>${escapeHtml(order?.priority || " - ")}</strong></div>
            <div class="active-part-detail-field"><span>Required Quantity</span><strong>${required}</strong></div>
            <div class="active-part-detail-field"><span>Picked Quantity</span><strong>${picked}</strong></div>
            <div class="active-part-detail-field"><span>Pending Quantity</span><strong>${pending}</strong></div>
            <div class="active-part-detail-field"><span>Picking Status</span><strong><span class="order-status ${statusClass}">${status}</span></strong></div>
          </div>
          <section class="active-bin-location" aria-label="Part bin location">
            <div class="active-bin-location-heading">
              <div>
                <span class="active-part-detail-eyebrow">BIN LOCATION</span>
                <h3>${escapeHtml(part[4] || "Unassigned")}</h3>
              </div>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V4h14v17M5 9h14M5 15h14M9 4v5m6-5v5m-6 1v5m6-5v5m-6 1v5m6-5v5"/></svg>
            </div>
            <div class="active-bin-illustration" role="img" aria-label="Illustration of storage bin ${escapeHtml(part[4] || "unassigned")}">
              <div class="active-bin-shelf">
                <div class="active-bin-box"><span></span><i></i></div>
                <div class="active-bin-box"><span></span><i></i></div>
                <div class="active-bin-box"><span></span><i></i></div>
              </div>
              <div class="active-bin-shelf">
                <div class="active-bin-box"><span></span><i></i></div>
                <div class="active-bin-box selected"><span>${escapeHtml(part[4] || " - ")}</span><i></i></div>
                <div class="active-bin-box"><span></span><i></i></div>
              </div>
              <div class="active-bin-shelf">
                <div class="active-bin-box"><span></span><i></i></div>
                <div class="active-bin-box"><span></span><i></i></div>
                <div class="active-bin-box"><span></span><i></i></div>
              </div>
            </div>
            <p class="active-bin-help">Locate the highlighted bin to pick this part.</p>
          </section>
        </div>
        <footer class="active-part-detail-actions">
          <button type="button" class="btn btn-secondary" data-close-active-order-detail>Close</button>
        </footer>
      </section>
    </div>
  `);
  document.getElementById("activeOrderPartDetail").querySelectorAll("[data-close-active-order-detail]").forEach((button) => {
    button.addEventListener("click", closeActiveOrderPartDetail);
  });
  document.addEventListener("keydown", closeActiveOrderPartDetail);
}

function closeActiveOrderPartDetail(event) {
  const dialog = document.getElementById("activeOrderPartDetail");
  if (!dialog) return;
  if (event?.type === "keydown" && event.key !== "Escape") return;
  if (event?.type === "click" && event.target !== dialog && !event.target.closest("[data-close-active-order-detail]")) return;
  dialog.remove();
  document.removeEventListener("keydown", closeActiveOrderPartDetail);
}

function selectPart(no) {
  selectedPart = no;
  dashboard();
}

function selectPartAt(index) {
  const part = parts[index];
  if (part) selectPart(part[0]);
}

function togglePartSelectionAt(index, checked) {
  const part = parts[index];
  if (!part) return;
  if (checked) {
    checkedParts.add(part[0]);
    selectedPart = part[0];
  } else {
    checkedParts.delete(part[0]);
    if (selectedPart === part[0]) selectedPart = "";
  }
  dashboard();
}

function pickPanel() {
  const p = parts.find((x) => x[0] === selectedPart);
  const orderItems = currentBOMItems();
  const selectedItem = p && orderItems.find(({ item }) => item.partNumber === p[0]);
  const visibleBins = new Map();
  if (p) visibleBins.set(p[4], selectedItem ? selectedItem.partIndex : parts.indexOf(p));
  orderItems.forEach(({ item, partIndex }) => {
    const part = parts[partIndex];
    if (checkedParts.has(item.partNumber) && pickedQty(part) < item.quantity && !visibleBins.has(part[4])) {
      visibleBins.set(part[4], partIndex);
    }
  });

  return `
    <div class="panel pick-panel">
      <div class="pick-head">${p ? `Selected Bin: <strong>${escapeHtml(p[4])}</strong>` : "Pick Location"}</div>
      ${p ? `<div class="pick-info"><span>Product: <b>${escapeHtml(p[1])}</b></span></div>` : `<p class="pick-empty">Select a material in the order table to display its bin and product.</p>`}
      ${visibleBins.size ? `<div class="bins">
        ${[...visibleBins.entries()]
          .map(([bin, index]) => `
              <button class="bin light-on ${p && bin === p[4] ? 'active' : ''}" aria-label="Select bin ${escapeHtml(bin)}; pick light on" onclick="selectPartAt(${index})">
                <span>${escapeHtml(bin)}</span>
              </button>
            `)
          .join("")}
      </div>` : ""}
      ${p ? `<div class="status-msg" id="pickMsg">READY - Simulation Mode</div>
      <button class="pick-now" onclick="pickNow()">PICK NOW</button>` : ""}
    </div>
  `;
}

function dashboardStatusPanel() {
  const activeBins = new Set(parts.map((part) => String(part[4] || "").trim()).filter(Boolean)).size;
  const lastUpdateDate = lastSavedAt
    ? new Date(lastSavedAt)
    : history[0]?.timestamp
      ? new Date(history[0].timestamp)
      : history[0]
        ? reportEntryDate(history[0])
        : null;
  const lastUpdate = lastUpdateDate && !Number.isNaN(lastUpdateDate.getTime())
    ? reportDateTimeLabel(lastUpdateDate)
    : "No saved changes yet";

  return `
    <section class="panel dashboard-system-status" aria-labelledby="systemStatusTitle">
      <h3 id="systemStatusTitle">System Status</h3>
      <div class="dashboard-status-online ${hardwareStatus.state}" id="systemStatusCard">
        <span class="system-online-indicator ${hardwareStatus.state}" id="systemOnlineIndicator" aria-hidden="true"></span>
        <div><span>USB-RS485 Adapter</span><strong id="systemConnectionLabel">${escapeHtml(hardwareStatusText())}</strong></div>
      </div>
      <div class="dashboard-status-list">
        <div class="dashboard-status-item">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 10h16M9 5v5m6-5v5m-6 4h6"/></svg>
          <span>Active Bins</span><strong>${activeBins} locations</strong>
        </div>
        <div class="dashboard-status-item">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3"/></svg>
          <span>System Devices</span><strong id="systemDeviceLabel">${escapeHtml(hardwareStatus.port ? "USB-RS485 adapter - " + hardwareStatus.port : "USB-RS485 adapter not selected")}</strong>
        </div>
        <div class="dashboard-status-item">
          <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>
          <span>Database</span><strong>Browser storage connected</strong>
        </div>
        <div class="dashboard-status-item">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2m-14 8-2 2a7 7 0 0 0 12.5-3"/></svg>
          <span>Last Update</span><strong>${escapeHtml(lastUpdate)}</strong>
        </div>
      </div>
    </section>
    <section class="panel dashboard-quick-actions" aria-labelledby="quickActionsTitle">
      <h3 id="quickActionsTitle">Quick Actions</h3>
      <div class="dashboard-quick-grid">
        <button class="dashboard-quick-action picking" type="button" onclick="go('active')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v3h3v15H3V6h3V3Zm0 3h12M7 11h10m-10 4h10m-10 4h6"/></svg>
          <strong>Start Picking</strong><span>Open Active Order</span>
        </button>
        <button class="dashboard-quick-action parts" type="button" onclick="go('partdetails')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5m-9 5v10"/></svg>
          <strong>Part Details</strong><span>Manage Parts</span>
        </button>
        <button class="dashboard-quick-action reports" type="button" onclick="go('reports')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11h4v9H4Zm6 0V5h4v15h-4Zm6 0v-7h4v7h-4Z"/></svg>
          <strong>View Reports</strong><span>Picking Reports</span>
        </button>
        <button class="dashboard-quick-action settings" type="button" onclick="go('settings')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1"/></svg>
          <strong>System Settings</strong><span>Configuration</span>
        </button>
      </div>
    </section>
  `;
}

function pickNow() {
  let p = parts.find((x) => x[0] === selectedPart);
  if (!p) return;

  const order = currentOrder();
  if (!order) return;
  if (pickedQty(p) >= requiredQty(p)) {
    alert("This item is already fully picked.");
    return;
  }

  order.picked[p[0]] = pickedQty(p) + 1;
  p[3]++;
  history.unshift({
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleString(),
    order: order.id,
    part: p[0],
    desc: p[1],
    bin: p[4],
    qty: 1,
    operator: settings.operator
  });
  save();
  dashboard();
}

function activeOrder() {
  const order = currentOrder();
  app.innerHTML = `
    <div class="page">
      <div class="page-title">Active Order</div>
      <div class="subtitle">Current customer order and picking progress</div>
      <div class="full-panel">
        <h2>${escapeHtml(order?.id || "No active order")}</h2>
        <p>Customer: ${escapeHtml(order?.customer || " - ")} &nbsp; | &nbsp; Priority: ${escapeHtml(order?.priority || " - ")}</p>
        <div class="active-order-toolbar">
          <button type="button" class="btn btn-small" onclick="openPartForm(null, 'active')">ADD PART</button>
        </div>
        ${partTable(true, true, "active-order-table-scroll", true, "active")}
      </div>
    </div>
  `;
}

function simpleTable(tableParts = parts) {
  return `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>Part Number</th>
            <th>Description</th>
            <th>Required</th>
            <th>Picked</th>
            <th>Pending</th>
            <th>Bin</th>
          </tr>
        </thead>
        <tbody>
          ${tableParts.map((p) => `
            <tr>
              <td>${escapeHtml(p[0])}</td>
              <td>${escapeHtml(p[1])}</td>
              <td>${p[2]}</td>
              <td>${p[3]}</td>
              <td>${p[2] - p[3]}</td>
              <td>${escapeHtml(p[4])}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function partsPage() {
  app.innerHTML = `
    <div class="page">
      <div class="page-title">Parts / Bins</div>
      <div class="subtitle">Component master and physical pick locations</div>
      <div class="full-panel">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Part Number</th>
                <th>Item / Description</th>
                <th>Available Qty</th><th>Status</th>
                <th>Bin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${parts.map((p, index) => `
                <tr>
                  <td>${escapeHtml(p[0])}</td>
                  <td>${escapeHtml(p[1])}</td>
                  <td>${p[5] ?? 0}</td>
                  <td><span class="part-detail-status ${p[5] < 10 ? "inactive" : p[5] < 30 ? "low-stock" : "active"}">${p[5] < 10 ? "Refill immediately" : p[5] < 30 ? "Low stock" : "Available"}</span></td>
                  <td>${escapeHtml(p[4])}</td>
                  <td class="part-row-actions">
                    <button type="button" class="part-row-icon-button edit" aria-label="Edit ${escapeHtml(p[0])}" title="Edit part" onclick="openManagedPartEdit('${escapeHtml(p[0])}', 'parts')">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg>
                    </button>
                    <button type="button" class="part-row-icon-button delete" aria-label="Delete ${escapeHtml(p[0])}" title="Delete part" onclick="confirmManagedPartDelete('${escapeHtml(p[0])}', 'parts')">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg>
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="actions">
          <button class="btn" onclick="openPartForm(null, 'parts')">ADD PART / BIN</button>
        </div>
      </div>
    </div>
  `;
}

let selectedDetailPartNo = "P12345";
let activePartDetailTab = "basic";
let partUploadIntent = "any";
let isCreatingNewPart = false;
let newPartDraft = null;

const initialPartDetailItems = [
  { partNo: "P12345", itemCode: "GH-001", description: "Gear Housing", material: "Aluminium", colour: "Silver", status: "Active", availableQty: "1,250", category: "Housing", dimensions: "120 x 100 x 80 mm", unit: "PCS", weight: "0.850", supplier: "Ravi Kumar", supplierCode: "SUP-001", supplierPhone: "+91 98765 43210", supplierEmail: "ravi@example.com", address: "NOVOTEK approved supplier", minimum: "200", maximum: "2,000" },
  { partNo: "P24680", itemCode: "SR-450", description: "Oil Seal", material: "Rubber", colour: "Black", status: "Active", availableQty: "2,150" },
  { partNo: "P33445", itemCode: "BL-556", description: "Bolt M8x20", material: "Steel", colour: "Silver", status: "Low Stock", availableQty: "1,250" },
  { partNo: "P77890", itemCode: "NT-008", description: "Cover Plate", material: "Steel", colour: "Silver", status: "Active", availableQty: "2,880" },
  { partNo: "P88901", itemCode: "SP-101", description: "Spacer", material: "Rubber", colour: "Black", status: "Active", availableQty: "3,420" },
  { partNo: "P13579", itemCode: "CP-330", description: "Gasket", material: "Rubber", colour: "Grey", status: "Inactive", availableQty: "5,610" },
  { partNo: "P11223", itemCode: "GL-112", description: "Bearing Shaft", material: "Steel", colour: "Grey", status: "Active", availableQty: "4,320" },
  { partNo: "P66771", itemCode: "BS-245", description: "Nut M8", material: "Aluminium", colour: "Silver", status: "Active", availableQty: "2,000" }
];
const savedPartDetailItems = JSON.parse(localStorage.getItem("novotekPartDetailItems") || "null");
const persistedPartDetailItems = Array.isArray(savedPartDetailItems) ? savedPartDetailItems : [];
const deletedPartDetailNos = new Set(JSON.parse(localStorage.getItem("novotekDeletedPartDetails") || "[]"));
function formattedStock(value, fallback) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  const quantity = Number(normalized);
  return normalized && Number.isFinite(quantity) && quantity >= 0
    ? quantity.toLocaleString("en-US")
    : fallback;
}

function stockStatus(value) {
  const quantity = Number(String(value ?? "0").replaceAll(",", ""));
  return quantity < 10 ? "Refill immediately" : quantity < 30 ? "Low stock" : "Available";
}

const partDetailItems = parts.map((part) => {
  const template = initialPartDetailItems.find((item) => item.partNo === part[0]) || {};
  const saved = persistedPartDetailItems.find((item) => item.partNo === part[0]) || {};
  return {
    ...template,
    ...saved,
    partNo: part[0],
    itemCode: saved.itemCode || template.itemCode || part[0],
    description: part[1],
    availableQty: formattedStock(part[5], "0"),
    status: stockStatus(part[5])
  };
});

function syncPartDetailItemsFromParts() {
  const currentItems = new Map(partDetailItems.map((item) => [item.partNo, item]));
  const nextItems = parts.map((part) => {
    const existing = currentItems.get(part[0]) || {};
    const template = initialPartDetailItems.find((item) => item.partNo === part[0]) || {};
    return {
      ...template,
      ...existing,
      partNo: part[0],
      itemCode: existing.itemCode || template.itemCode || part[0],
      description: part[1],
      availableQty: formattedStock(part[5], "0"),
      status: stockStatus(part[5])
    };
  });
  partDetailItems.splice(0, partDetailItems.length, ...nextItems);
  localStorage.setItem("novotekPartDetailItems", JSON.stringify(partDetailItems));
}
if (!partDetailItems.length) {
  selectedDetailPartNo = "";
  isCreatingNewPart = true;
  newPartDraft = createEmptyPartDetail();
}

function createEmptyPartDetail() {
  return {
    partNo: "",
    itemCode: "",
    description: "",
    material: "",
    colour: "",
    status: "Active",
    availableQty: "0",
    category: "Housing",
    dimensions: "",
    unit: "PCS",
    weight: "",
    supplierCompany: "",
    supplierPerson: "",
    supplierCode: "",
    supplierPhone: "",
    supplierEmail: "",
    address: "",
    minimum: "0",
    maximum: "0"
  };
}

function partDetailsPage() {
  const tabs = [
    ["basic", "Basic Details", '<path d="m12 2.8 8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4L12 2.8Z"/><path d="m3.8 7.4 8.2 4.7 8.2-4.7M12 12.1v9.1"/>'],
    ["supplier", "Supplier Details", '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.6-2 3-2s2.4.6 3 2m2-5h3m-3 3h3"/>'],
    ["inventory", "Inventory", '<path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9m-4-6 8-4.5"/>'],
    ["image", "Image / Drawing", '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 5-5 3 3 2-2 4 4"/>'],
    ["additional", "Additional Info", '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>']
  ];

  app.innerHTML = `
    <div class="page part-details-page">
      <div class="page-title">Part Details</div>
      <div class="part-details-shell">
        <div class="part-details-panel">
          <div class="part-section-heading">
            <h2>PART DETAILS</h2>
            <span>Part records and current stock</span>
          </div>
          <div class="part-details-toolbar">
            <label class="part-search">
              <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="5.5"/><path d="M16 16L21 21"/></svg>
              <input id="partDetailsSearch" type="search" placeholder="Search by Part No. or Description..." aria-label="Search parts">
            </label>
            <select class="part-category-filter" id="partDetailsCategory" aria-label="Filter parts by category">
              <option value="">All Categories</option>
              <option value="General">General</option><option value="Housing">Housing</option><option value="Fastener">Fastener</option><option value="Seal">Seal</option><option value="Electrical">Electrical</option><option value="Other">Other</option>
            </select>
            <div class="part-count" id="partDetailsCount">Showing 1 to ${partDetailItems.length} of ${partDetailItems.length} parts</div>
            <button type="button" class="part-new-button" id="newPartDetail">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
              Add New Part
            </button>
          </div>
          <div class="part-details-table-wrap">
            <table class="part-details-table">
              <thead><tr>
                <th>#</th><th>Image</th><th>Part No.</th><th>Description</th>
                <th>Material</th><th>Colour</th><th>Available Qty</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody id="partDetailsRows"></tbody>
            </table>
          </div>
        </div>

        <aside class="part-details-form">
          <h3>PART DETAILS ENTRY</h3>
          <div class="part-detail-tabs" role="tablist" aria-label="Part detail sections">
            ${tabs.map(([id, label, icon]) => `<button type="button" class="part-detail-tab ${activePartDetailTab === id ? "active" : ""}" role="tab" aria-selected="${activePartDetailTab === id}" data-part-tab="${id}"><svg class="part-detail-tab-icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span></button>`).join("")}
          </div>
          <div class="part-detail-content" id="partDetailContent"></div>
          <div class="part-entry-actions">
            <button type="button" class="detail-button secondary" id="resetPartDetails">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11a8.5 8.5 0 1 1 2.6 6.1M3.5 4.5V11h6.5"/></svg>
              Reset
            </button>
            <button type="button" class="detail-button save-part-button" id="savePartDetails">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3.5h13l3 3V20a.5.5 0 0 1-.5.5h-13A2.5 2.5 0 0 1 4 18V3.5Z"/><path d="M8 3.5v6h8v-6M8 20.5v-7h9v7"/></svg>
              Save
            </button>
            <button type="button" class="detail-button update-part-button" id="updatePartDetails">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5"/></svg>
              Update
            </button>
            <input id="partAssetFile" type="file" accept="image/*,.pdf,.dxf,.dwg" hidden>
          </div>
          <p class="part-entry-status" id="partEntryStatus" role="status" aria-live="polite"></p>
        </aside>
      </div>
    </div>
  `;

  renderPartDetailRows();
  renderPartDetailTab();
  document.getElementById("partAssetFile").addEventListener("change", uploadPartAsset);
  document.getElementById("resetPartDetails").addEventListener("click", resetPartDetails);
  document.getElementById("savePartDetails").addEventListener("click", () => savePartDetails("Saved"));
  document.getElementById("updatePartDetails").addEventListener("click", () => savePartDetails("Updated"));
  document.getElementById("newPartDetail").addEventListener("click", startNewPartDetail);
  document.getElementById("partDetailsSearch").addEventListener("input", renderPartDetailRows);
  document.getElementById("partDetailsCategory").addEventListener("change", renderPartDetailRows);

  document.querySelectorAll(".part-detail-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      updateNewPartDraftFromForm();
      activePartDetailTab = tab.dataset.partTab;
      renderPartDetailTab();
    });
  });
  document.getElementById("partDetailsRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-part], [data-delete-part], [data-select-part]");
    if (!button) return;
    if (button.dataset.editPart) {
      editPartDetails(button.dataset.editPart);
    } else if (button.dataset.deletePart) {
      deletePartDetails(button.dataset.deletePart);
    } else {
      selectedDetailPartNo = button.dataset.selectPart;
      isCreatingNewPart = false;
      partDetailsPage();
    }
  });
  document.getElementById("partDetailsRows").addEventListener("click", (event) => {
    if (event.target.closest("button, input")) return;
    const row = event.target.closest("[data-part-row]");
    if (!row) return;
    selectedDetailPartNo = row.dataset.partRow;
    isCreatingNewPart = false;
    partDetailsPage();
  });
}

function editPartDetails(partNo) {
  if (!partDetailItems.some((item) => item.partNo === partNo)) return;
  selectedDetailPartNo = partNo;
  isCreatingNewPart = false;
  activePartDetailTab = "basic";
  partDetailsPage();
  document.getElementById("partEntryStatus").textContent = `Editing ${partNo}. Update the fields and select Update to save.`;
}

function deletePartDetails(partNo) {
  const part = partDetailItems.find((item) => item.partNo === partNo);
  if (!part) return;
  requestPartActionConfirmation("delete", partNo, () => performDeletePartDetails(partNo));
}

function performDeletePartDetails(partNo) {
  const detailPart = partDetailItems.find((item) => item.partNo === partNo);
  const partIndex = parts.findIndex((item) => item[0] === partNo);
  if (!detailPart || partIndex < 0) return;

  parts.splice(partIndex, 1);
  boms.forEach((bom) => {
    bom.items = bom.items.filter((item) => item.partNumber !== partNo);
  });
  orders.forEach((order) => {
    delete order.picked[partNo];
  });
  checkedParts.delete(partNo);
  if (selectedPart === partNo) selectedPart = "";
  save();

  if (selectedDetailPartNo === partNo) {
    selectedDetailPartNo = partDetailItems[0]?.partNo || "";
    isCreatingNewPart = partDetailItems.length === 0;
    newPartDraft = isCreatingNewPart ? createEmptyPartDetail() : null;
  }
  renderPartDetailRows();
  renderPartDetailTab();
  const status = document.getElementById("partEntryStatus");
  if (status) status.textContent = `Deleted ${partNo}.`;
  Promise.all([deletePartImage(partNo), deletePartDrawing(partNo)]).catch((error) => {
    const currentStatus = document.getElementById("partEntryStatus");
    if (currentStatus) currentStatus.textContent = `Deleted ${partNo}, but its saved image or drawing could not be removed: ${error.message}`;
  });
}
function requestPartActionConfirmation(action, partNo, onConfirmed) {
  const part = partDetailItems.find((item) => item.partNo === partNo)
    || parts.find((item) => item[0] === partNo);
  if (!part || !["edit", "update", "delete"].includes(action)) return;

  pendingPartActionConfirmation = {
    action,
    partNo,
    description: action === "delete" ? part.description || part[1] : part.description || part[1],
    onConfirmed
  };
  renderPartActionConfirmation();
  document.addEventListener("keydown", handlePartActionConfirmationKeydown);
}

function renderPartActionConfirmation() {
  const pending = pendingPartActionConfirmation;
  if (!pending) return;
  document.getElementById("partActionConfirmation")?.remove();
  const actionLabel = pending.action === "update" ? "save these changes to" : pending.action === "edit" ? "edit" : "delete";
  const confirmLabel = pending.action === "update" ? "Confirm Update" : pending.action === "edit" ? "Confirm Edit" : "Confirm Delete";
  const title = pending.action === "update" ? "Confirm Update" : pending.action === "edit" ? "Confirm Edit" : "Confirm Delete";
  const prompt = pending.action === "update"
    ? "Are you sure you want to save these changes?"
    : `Are you sure you want to ${actionLabel} this part?`;
  const caution = pending.action === "delete"
    ? "Deleting this entry cannot be undone."
    : pending.action === "update"
      ? "Your changes will be applied to this part."
      : "The part entry form will open so you can make changes.";

  document.body.insertAdjacentHTML("beforeend", `
    <div class="part-action-confirm-backdrop" id="partActionConfirmation">
      <section class="part-action-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="partActionConfirmTitle" aria-describedby="partActionConfirmMessage">
        <div class="part-action-confirm-icon ${pending.action}" aria-hidden="true">
          ${pending.action !== "delete"
            ? '<svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg>'}
        </div>
        <span class="part-action-confirm-step">CONFIRM ACTION</span>
        <h2 id="partActionConfirmTitle">${title}</h2>
        <p class="part-action-confirm-part">${escapeHtml(pending.partNo)} | ${escapeHtml(pending.description)}</p>
        <p id="partActionConfirmMessage">${prompt}</p>
        <p class="part-action-confirm-caution ${pending.action}">${caution}</p>
        <div class="part-action-confirm-buttons">
          <button type="button" class="btn btn-secondary" data-cancel-part-action>Cancel</button>
          <button type="button" class="btn ${pending.action === "delete" ? "red" : ""}" data-confirm-part-action>
            ${confirmLabel}
          </button>
        </div>
      </section>
    </div>
  `);
  const backdrop = document.getElementById("partActionConfirmation");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closePartActionConfirmation();
  });
  backdrop.querySelector("[data-cancel-part-action]").addEventListener("click", closePartActionConfirmation);
  backdrop.querySelector("[data-confirm-part-action]").addEventListener("click", confirmPartActionStep);
  backdrop.querySelector("[data-confirm-part-action]").focus();
}

function confirmPartActionStep() {
  if (!pendingPartActionConfirmation) return;
  const onConfirmed = pendingPartActionConfirmation.onConfirmed;
  closePartActionConfirmation();
  onConfirmed();
}

function closePartActionConfirmation() {
  document.getElementById("partActionConfirmation")?.remove();
  pendingPartActionConfirmation = null;
  document.removeEventListener("keydown", handlePartActionConfirmationKeydown);
}

function handlePartActionConfirmationKeydown(event) {
  if (event.key === "Escape") closePartActionConfirmation();
}

function startNewPartDetail() {
  selectedDetailPartNo = "";
  isCreatingNewPart = true;
  newPartDraft = createEmptyPartDetail();
  activePartDetailTab = "basic";
  document.getElementById("partDetailsSearch").value = "";
  renderPartDetailRows();
  renderPartDetailTab();
  document.getElementById("partEntryStatus").textContent = "Enter the new part details, then save to add it to the table.";
}

function updateNewPartDraftFromForm() {
  if (!isCreatingNewPart || !newPartDraft) return;
  document.querySelectorAll("#partDetailContent [data-detail-field]").forEach((input) => {
    newPartDraft[input.dataset.detailField] = input.value.trim();
  });
}

function renderPartDetailRows() {
  const search = document.getElementById("partDetailsSearch").value.trim().toLowerCase();
  const category = document.getElementById("partDetailsCategory").value;
  const filtered = partDetailItems.filter((item) => {
    const values = [item.partNo, item.itemCode, item.description];
    const matchesSearch = values.some((value) => String(value || "").toLowerCase().includes(search));
    return matchesSearch && (!category || (item.category || "General") === category);
  });
  const tbody = document.getElementById("partDetailsRows");
  tbody.innerHTML = filtered.map((item, index) => {
    const statusClass = item.status === "Low stock" ? "low-stock" : item.status === "Refill immediately" ? "inactive" : "active";
    return "<tr data-part-row=\"" + escapeHtml(item.partNo) + "\" class=\"" + (item.partNo === selectedDetailPartNo ? "selected" : "") + "\">" +
      "<td class=\"part-serial-cell\">" + (index + 1) + "</td>" +
      "<td class=\"part-thumbnail-cell\" data-image-part=\"" + escapeHtml(item.partNo) + "\"><span class=\"part-thumbnail-placeholder\" aria-label=\"No image uploaded\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"8.5\" cy=\"9\" r=\"1.5\"/><path d=\"m4 17 5-5 3 3 3-3 5 5\"/></svg></span></td>" +
      "<td class=\"part-code-cell\">" + escapeHtml(item.partNo) + "</td>" +
      "<td>" + escapeHtml(item.description || "—") + "</td>" +
      "<td>" + escapeHtml(item.material || "—") + "</td>" +
      "<td>" + escapeHtml(item.colour || "—") + "</td>" +
      "<td class=\"part-available-cell\">" + escapeHtml(item.availableQty) + "</td>" +
      "<td><span class=\"part-detail-status " + statusClass + "\">" + escapeHtml(item.status) + "</span></td>" +
      "<td class=\"part-row-actions\"><button type=\"button\" class=\"part-row-icon-button edit\" data-edit-part=\"" + escapeHtml(item.partNo) + "\" aria-label=\"Edit " + escapeHtml(item.partNo) + "\" title=\"Edit part\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z\"/></svg></button>" +
      "<button type=\"button\" class=\"part-row-icon-button delete\" data-delete-part=\"" + escapeHtml(item.partNo) + "\" aria-label=\"Delete " + escapeHtml(item.partNo) + "\" title=\"Delete part\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5\"/></svg></button></td></tr>";
  }).join("") || "<tr><td colspan=\"9\" class=\"part-empty\">No matching parts found.</td></tr>";
  document.getElementById("partDetailsCount").textContent = filtered.length
    ? "Showing 1 to " + filtered.length + " of " + partDetailItems.length + " parts"
    : "Showing 0 of " + partDetailItems.length + " parts";
  loadPartTableImages(filtered);
}

function loadPartTableImages(items) {
  items.forEach((item) => {
    getPartImage(item.partNo).then((record) => {
      const cell = [...document.querySelectorAll(".part-thumbnail-cell")].find((candidate) => candidate.dataset.imagePart === item.partNo);
      if (!cell || !record) return;
      const image = document.createElement("img");
      image.className = "part-thumbnail";
      image.src = record.dataUrl;
      image.alt = "Image of " + item.description;
      cell.replaceChildren(image);
    }).catch(() => {});
  });
}

function renderPartDetailTab() {
  const part = isCreatingNewPart
    ? (newPartDraft || createEmptyPartDetail())
    : partDetailItems.find((item) => item.partNo === selectedDetailPartNo) || partDetailItems[0];
  if (!part) return;
  const content = document.getElementById("partDetailContent");
  document.querySelectorAll(".part-detail-tab").forEach((tab) => {
    const selected = tab.dataset.partTab === activePartDetailTab;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  const field = (label, name, value, type) => "<div class=\"form-field\"><label>" + label + "</label><input data-detail-field=\"" + name + "\" type=\"" + (type || "text") + "\" value=\"" + escapeHtml(value || "") + "\"></div>";
  const fullField = (label, name, value) => "<div class=\"form-field full\"><label>" + label + "</label><input data-detail-field=\"" + name + "\" value=\"" + escapeHtml(value || "") + "\"></div>";
  const selectField = (label, name, value, options) => "<div class=\"form-field\"><label>" + label + "</label><select data-detail-field=\"" + name + "\">" +
    [value, ...options].filter((option, index, list) => option && list.indexOf(option) === index).map((option) => "<option value=\"" + escapeHtml(option) + "\"" + (option === value ? " selected" : "") + ">" + escapeHtml(option) + "</option>").join("") + "</select></div>";
  const stock = String(part.availableQty || "0").replaceAll(",", "");
  if (activePartDetailTab === "basic") {
    const stockCard = (label, name, value, extraClass) => "<div class=\"part-stock-card " + (extraClass || "") + "\"><svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"m24 4 10 6-10 6-10-6 10-6Zm-10 6v11l10 6V16m10-6v11l-10 6m-10-5 10 6-10 6-10-6 10-6Zm-10 6v11l10 6V27m10-6v11l-10 6m10-12 10 6-10 6-10-6 10-6Zm-10 6v11l10 6V33m10-6v11l-10 6\"/></svg><div class=\"part-stock-value\"><label>" + label + "</label><div><input data-detail-field=\"" + name + "\" type=\"number\" min=\"0\" step=\"1\" value=\"" + escapeHtml(value) + "\"><span>" + escapeHtml(part.unit || "PCS") + "</span></div></div></div>";
    content.innerHTML = "<div class=\"part-basic-layout\"><div class=\"part-basic-fields\">" +
      field("Part No.*", "partNo", part.partNo) + fullField("Description*", "description", part.description) +
      selectField("Part Category", "category", part.category || "General", ["General", "Housing", "Fastener", "Seal", "Electrical", "Other"]) +
      selectField("Material*", "material", part.material || "Steel", ["Aluminium", "Rubber", "Steel"]) +
      selectField("Colour", "colour", part.colour || "Silver", ["Silver", "Black", "Grey"]) +
      selectField("Unit of Measure*", "unit", part.unit || "PCS", ["PCS", "KG", "M", "SET"]) + field("Weight (kg)", "weight", part.weight || "", "number") +
      "</div><div class=\"part-basic-side\"><section class=\"part-basic-image-card\" aria-label=\"Selected part image\"><div class=\"part-image-preview\" id=\"partImagePreview\"><img id=\"partImage\" alt=\"Image for " + escapeHtml(part.partNo) + "\" hidden><div class=\"part-image-empty\" id=\"partImageEmpty\"><svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><rect x=\"5\" y=\"7\" width=\"38\" height=\"34\" rx=\"4\"/><circle cx=\"17\" cy=\"18\" r=\"3\"/><path d=\"m8 36 12-12 7 7 5-5 8 10\"/></svg><strong>No part image uploaded</strong><span>Upload an image for " + escapeHtml(part.partNo) + "</span></div></div><div class=\"part-basic-asset-buttons\"><button class=\"detail-button secondary\" id=\"uploadBasicImage\" type=\"button\">Add Image</button><button class=\"detail-button secondary remove-part-asset\" id=\"removeBasicImage\" type=\"button\" disabled onclick=\"removePartImage()\">Remove Image</button><button class=\"detail-button secondary\" id=\"uploadBasicDrawing\" type=\"button\">Add Drawing</button><button class=\"detail-button secondary remove-part-asset\" id=\"removeBasicDrawing\" type=\"button\" disabled onclick=\"removePartDrawing()\">Remove Drawing</button><a class=\"detail-button secondary basic-drawing-link\" id=\"basicDrawingLink\" hidden target=\"_blank\" rel=\"noopener\">View Drawing</a></div><p class=\"part-asset-file\" id=\"partImageName\">No image file selected</p></section><section class=\"part-stock-summary\" aria-label=\"Part stock quantities\">" +
      stockCard("Available Quantity", "availableQty", stock, "available") + stockCard("Minimum Stock", "minimum", String(part.minimum || "0").replaceAll(",", "")) + stockCard("Maximum Stock", "maximum", String(part.maximum || "0").replaceAll(",", "")) + "</section></div></div>";
    loadPartImage(part.partNo);
    loadPartDrawing(part.partNo);
    document.getElementById("uploadBasicImage").addEventListener("click", () => requestPartUpload("image"));
    document.getElementById("uploadBasicDrawing").addEventListener("click", () => requestPartUpload("drawing"));
  } else if (activePartDetailTab === "supplier") {
    content.innerHTML = "<div class=\"part-grid\">" + fullField("Supplier / Company", "supplierCompany", part.supplierCompany || "") + field("Supplier Code", "supplierCode", part.supplierCode || "") + field("Contact Person", "supplierPerson", part.supplierPerson || part.supplier || "") + field("Phone Number", "supplierPhone", part.supplierPhone || "", "tel") + field("Email Address", "supplierEmail", part.supplierEmail || "", "email") + "<div class=\"form-field full\"><label>Address</label><textarea data-detail-field=\"address\">" + escapeHtml(part.address || "") + "</textarea></div></div>";
  } else if (activePartDetailTab === "inventory") {
    content.innerHTML = "<div class=\"part-grid inventory-grid\">" + field("Available Quantity", "availableQty", stock, "number") + field("Minimum Stock", "minimum", part.minimum || "0", "number") + field("Maximum Stock", "maximum", part.maximum || "0", "number") + field("Unit of Measure", "unit", part.unit || "PCS") + field("Inventory Status", "status", part.status) + field("Date & Time", "updatedAt", part.updatedAt || "") + "</div>";
  } else if (activePartDetailTab === "image") {
    content.innerHTML = "<div class=\"part-image-heading\"><div><strong>" + escapeHtml(part.partNo) + " — " + escapeHtml(part.description) + "</strong><span>Upload an image and a drawing, when available, for this part.</span></div></div><div class=\"part-asset-grid\"><section class=\"part-asset-card\"><h4>Part Image</h4><div class=\"part-image-preview\" id=\"partImagePreview\"><img id=\"partImage\" alt=\"Image for " + escapeHtml(part.partNo) + "\" hidden><div class=\"part-image-empty\" id=\"partImageEmpty\"><strong>No image uploaded</strong><span>Use Upload and choose an image file.</span></div></div><p class=\"part-asset-file\" id=\"partImageName\">No image file selected</p><div class=\"part-asset-controls\"><button class=\"detail-button secondary\" id=\"uploadDetailImage\" type=\"button\">Add Image</button><button class=\"detail-button secondary remove-part-asset\" id=\"removeDetailImage\" type=\"button\" disabled onclick=\"removePartImage()\">Remove Image</button></div></section><section class=\"part-asset-card\"><h4>Image / Drawing</h4><div class=\"part-drawing-preview\" id=\"partDrawingPreview\"><strong id=\"partDrawingName\">No drawing uploaded</strong><a id=\"partDrawingLink\" hidden target=\"_blank\" rel=\"noopener\">View / Download Drawing</a></div><p class=\"part-asset-file\">Supported drawings: PDF, DXF, DWG</p><div class=\"part-asset-controls\"><button class=\"detail-button secondary\" id=\"uploadDetailDrawing\" type=\"button\">Add Drawing</button><button class=\"detail-button secondary remove-part-asset\" id=\"removeDetailDrawing\" type=\"button\" disabled onclick=\"removePartDrawing()\">Remove Drawing</button></div></section></div><p class=\"part-image-status\" id=\"partImageStatus\" role=\"status\"></p>";
    loadPartImage(part.partNo);
    loadPartDrawing(part.partNo);
    document.getElementById("uploadDetailImage").addEventListener("click", () => requestPartUpload("image"));
    document.getElementById("uploadDetailDrawing").addEventListener("click", () => requestPartUpload("drawing"));
  } else {
    content.innerHTML = "<div class=\"part-grid\"><div class=\"form-field full\"><label>Additional Info</label><textarea data-detail-field=\"additionalInfo\">" + escapeHtml(part.additionalInfo || "Approved for production use with active quality check and replenishment monitoring.") + "</textarea></div></div>";
  }
}
function requestPartUpload(intent) {
  if (isCreatingNewPart) {
    document.getElementById("partEntryStatus").textContent = "Save the new part before uploading its image or drawing.";
    return;
  }
  partUploadIntent = intent;
  const input = document.getElementById("partAssetFile");
  input.accept = intent === "image"
    ? "image/*"
    : intent === "drawing"
      ? ".pdf,.dxf,.dwg,application/pdf"
      : "image/*,.pdf,.dxf,.dwg";
  input.click();
}

function openPartImageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("novotekPartDetails", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("images")) {
        request.result.createObjectStore("images", { keyPath: "partNo" });
      }
      if (!request.result.objectStoreNames.contains("drawings")) {
        request.result.createObjectStore("drawings", { keyPath: "partNo" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the part image database."));
  });
}

function getPartImage(partNo) {
  return openPartImageDatabase().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction("images", "readonly").objectStore("images").get(partNo);
    request.onsuccess = () => {
      resolve(request.result || null);
      db.close();
    };
    request.onerror = () => {
      reject(request.error || new Error("Could not read the part image."));
      db.close();
    };
  }));
}

function putPartImage(imageRecord) {
  return openPartImageDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction("images", "readwrite");
    transaction.objectStore("images").put(imageRecord);
    transaction.oncomplete = () => {
      resolve();
      db.close();
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error("Could not save the part image."));
      db.close();
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error("Saving the part image was cancelled."));
      db.close();
    };
  }));
}

function deletePartImage(partNo) {
  return openPartImageDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction("images", "readwrite");
    transaction.objectStore("images").delete(partNo);
    transaction.oncomplete = () => {
      resolve();
      db.close();
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error("Could not remove the part image."));
      db.close();
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error("Removing the part image was cancelled."));
      db.close();
    };
  }));
}

function deletePartDrawing(partNo) {
  return openPartImageDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction("drawings", "readwrite");
    transaction.objectStore("drawings").delete(partNo);
    transaction.oncomplete = () => {
      resolve();
      db.close();
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error("Could not remove the part drawing."));
      db.close();
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error("Removing the part drawing was cancelled."));
      db.close();
    };
  }));
}

function getPartDrawing(partNo) {
  return openPartImageDatabase().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction("drawings", "readonly").objectStore("drawings").get(partNo);
    request.onsuccess = () => {
      resolve(request.result || null);
      db.close();
    };
    request.onerror = () => {
      reject(request.error || new Error("Could not read the part drawing."));
      db.close();
    };
  }));
}

function putPartDrawing(drawingRecord) {
  return openPartImageDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction("drawings", "readwrite");
    transaction.objectStore("drawings").put(drawingRecord);
    transaction.oncomplete = () => {
      resolve();
      db.close();
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error("Could not save the part drawing."));
      db.close();
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error("Saving the part drawing was cancelled."));
      db.close();
    };
  }));
}

function showPartImage(imageRecord) {
  const image = document.getElementById("partImage");
  const empty = document.getElementById("partImageEmpty");
  const fileName = document.getElementById("partImageName");
  if (!image || !empty || !fileName) return;
  const removeButton = document.getElementById("removeBasicImage") || document.getElementById("removeDetailImage");
  image.hidden = !imageRecord;
  empty.hidden = Boolean(imageRecord);
  if (removeButton) removeButton.disabled = !imageRecord;
  fileName.textContent = imageRecord?.name || "No image file selected";
  if (imageRecord) image.src = imageRecord.dataUrl;
  else image.removeAttribute("src");
}

function loadPartImage(partNo) {
  getPartImage(partNo).then((record) => {
    if (selectedDetailPartNo === partNo && ["basic", "image"].includes(activePartDetailTab)) showPartImage(record);
  }).catch((error) => {
    const status = document.getElementById("partImageStatus") || document.getElementById("partEntryStatus");
    if (status) status.textContent = `Could not load this part's image: ${error.message}`;
  });
}

function loadPartDrawing(partNo) {
  getPartDrawing(partNo).then((record) => {
    if (selectedDetailPartNo !== partNo || !["basic", "image"].includes(activePartDetailTab)) return;
    const name = document.getElementById("partDrawingName");
    const link = document.getElementById("partDrawingLink") || document.getElementById("basicDrawingLink");
    if (!link) return;
    const removeButton = document.getElementById("removeBasicDrawing") || document.getElementById("removeDetailDrawing");
    if (name) name.textContent = record?.name || "No drawing uploaded";
    link.hidden = !record;
    if (removeButton) removeButton.disabled = !record;
    if (record) {
      link.href = record.dataUrl;
      if (name) {
        link.download = record.name;
        link.textContent = `View / Download ${record.name}`;
      } else {
        link.removeAttribute("download");
        link.title = `View drawing: ${record.name}`;
      }
    } else {
      link.removeAttribute("href");
      link.removeAttribute("download");
    }
  }).catch((error) => {
    const status = document.getElementById("partImageStatus") || document.getElementById("partEntryStatus");
    if (status) status.textContent = `Could not load this part's drawing: ${error.message}`;
  });
}

function uploadPartAsset(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const setStatus = (message) => {
    const status = document.getElementById("partImageStatus") || document.getElementById("partEntryStatus");
    if (status) status.textContent = message;
  };
  const extension = file.name.split(".").pop().toLowerCase();
  const isImage = file.type.startsWith("image/");
  const isDrawing = file.type === "application/pdf" || ["pdf", "dxf", "dwg"].includes(extension);
  const uploadIntent = partUploadIntent;
  partUploadIntent = "any";
  if ((uploadIntent === "image" && !isImage) || (uploadIntent === "drawing" && !isDrawing)) {
    setStatus(uploadIntent === "image" ? "Choose an image file." : "Choose a PDF, DXF, or DWG drawing.");
    return;
  }
  if (!isImage && !isDrawing) {
    setStatus("Choose an image or a PDF, DXF, or DWG drawing.");
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    setStatus("The selected file is too large. Maximum file size is 30 MB.");
    return;
  }
  const partNo = selectedDetailPartNo;
  const reader = new FileReader();
  reader.onload = () => {
    const record = { partNo, name: file.name, type: file.type, dataUrl: reader.result };
    const saveFile = isImage ? putPartImage(record) : putPartDrawing(record);
    saveFile
      .then(() => {
        if (selectedDetailPartNo === partNo && ["basic", "image"].includes(activePartDetailTab)) {
          if (isImage) showPartImage(record);
          else loadPartDrawing(partNo);
        }
        if (document.getElementById("partDetailsRows")) renderPartDetailRows();
        setStatus(`${file.name} uploaded for ${partNo}.`);
      })
      .catch((error) => {
        setStatus(`Could not save the selected file: ${error.message}`);
      });
  };
  reader.onerror = () => {
    setStatus("Could not read the selected file.");
  };
  reader.readAsDataURL(file);
}

function resetPartDetails() {
  if (isCreatingNewPart) newPartDraft = createEmptyPartDetail();
  renderPartDetailTab();
  const status = document.getElementById("partEntryStatus");
  if (status) status.textContent = "Unsaved changes reset.";
}

function savePartDetails(action = "Saved", confirmed = false) {
  const creating = isCreatingNewPart;
  updateNewPartDraftFromForm();
  const part = creating
    ? { ...(newPartDraft || createEmptyPartDetail()) }
    : partDetailItems.find((item) => item.partNo === selectedDetailPartNo);
  const status = document.getElementById("partEntryStatus");
  if (!part) {
    status.textContent = "Select a part before saving its details.";
    return;
  }

  const values = [...document.querySelectorAll("#partDetailContent [data-detail-field]")];
  const nextPart = { ...part };
  for (const input of values) {
    const name = input.dataset.detailField;
    const value = input.value.trim();
    const numericValue = ["availableQty", "minimum", "maximum"].includes(name)
      ? value.replaceAll(",", "")
      : value;
    if (["availableQty", "minimum", "maximum"].includes(name) && (numericValue === "" || !Number.isFinite(Number(numericValue)) || Number(numericValue) < 0)) {
      status.textContent = `${name === "availableQty" ? "Available quantity" : name === "minimum" ? "Minimum stock" : "Maximum stock"} is required and must be zero or a positive number.`;
      input.focus();
      return;
    }
    if (name === "weight" && value !== "" && (!Number.isFinite(Number(numericValue)) || Number(numericValue) < 0)) {
      status.textContent = "Weight must be zero or a positive number.";
      input.focus();
      return;
    }
    nextPart[name] = numericValue;
  }
  if (!nextPart.itemCode) nextPart.itemCode = nextPart.partNo;
  if (creating) {
    const requiredFields = [
      ["partNo", "Part No."],
      ["description", "Description"],
      ["material", "Material"]
    ];
    const missing = requiredFields.find(([name]) => !nextPart[name]);
    if (missing) {
      status.textContent = `${missing[1]} is required.`;
      if (activePartDetailTab !== "basic") {
        activePartDetailTab = "basic";
        renderPartDetailTab();
      }
      document.querySelector(`[data-detail-field="${missing[0]}"]`)?.focus();
      return;
    }
    const duplicate = partDetailItems.some((item) => item.partNo.toLowerCase() === nextPart.partNo.toLowerCase());
    if (duplicate) {
      status.textContent = "Part No. must be unique.";
      return;
    }
  }
  if (Number(nextPart.minimum || 0) > Number(nextPart.maximum || 0)) {
    status.textContent = "Minimum stock cannot be greater than maximum stock.";
    return;
  }
  nextPart.availableQty = formattedStock(nextPart.availableQty, "0");
  nextPart.minimum = formattedStock(nextPart.minimum, "0");
  nextPart.maximum = formattedStock(nextPart.maximum, "0");
  nextPart.updatedAt = new Date().toLocaleString("en-IN");

  if (!creating && action === "Updated" && !confirmed) {
    requestPartActionConfirmation("update", nextPart.partNo, () => savePartDetails(action, true));
    return;
  }

  try {
    const previousPartNo = creating ? "" : part.partNo;
    const linkedPart = creating ? null : parts.find((item) => item[0] === previousPartNo);
    const availableQuantity = Number(String(nextPart.availableQty).replaceAll(",", ""));
    if (linkedPart) {
      linkedPart[0] = nextPart.partNo;
      linkedPart[1] = nextPart.description;
      linkedPart[5] = availableQuantity;
    } else {
      parts.push([nextPart.partNo, nextPart.description, 0, 0, "Unassigned", availableQuantity]);
    }
    if (previousPartNo && previousPartNo !== nextPart.partNo) {
      boms.forEach((bom) => bom.items.forEach((item) => {
        if (item.partNumber === previousPartNo) item.partNumber = nextPart.partNo;
      }));
      orders.forEach((order) => {
        if (Object.prototype.hasOwnProperty.call(order.picked, previousPartNo)) {
          order.picked[nextPart.partNo] = order.picked[previousPartNo];
          delete order.picked[previousPartNo];
        }
      });
    }
    const nextItems = creating
      ? [...partDetailItems, nextPart]
      : partDetailItems.map((item) => item === part ? nextPart : item);
    const nextDeleted = new Set(deletedPartDetailNos);
    nextDeleted.delete(nextPart.partNo);
    localStorage.setItem("novotekPartDetailItems", JSON.stringify(nextItems));
    localStorage.setItem("novotekDeletedPartDetails", JSON.stringify([...nextDeleted]));
    deletedPartDetailNos.clear();
    nextDeleted.forEach((item) => deletedPartDetailNos.add(item));
    if (creating) {
      partDetailItems.push(nextPart);
      selectedDetailPartNo = nextPart.partNo;
      isCreatingNewPart = false;
      newPartDraft = null;
    } else {
      Object.assign(part, nextPart);
    }
    renderPartDetailRows();
    renderPartDetailTab();
    status.textContent = `${creating ? "Added" : action} ${nextPart.partNo} details.`;
    save();
    renderPartDetailRows();
    renderPartDetailTab();
  } catch (error) {
    status.textContent = `Could not save part details: ${error.message}`;
  }
}

function removePartImage() {
  const partNo = selectedDetailPartNo;
  const status = document.getElementById("partImageStatus") || document.getElementById("partEntryStatus");
  const imageButton = document.getElementById("removeBasicImage") || document.getElementById("removeDetailImage");
  if (!partNo) {
    status.textContent = "Save the new part before removing an image.";
    return;
  }
  if (imageButton?.disabled) return;
  deletePartImage(partNo).then(() => {
    if (selectedDetailPartNo === partNo && ["basic", "image"].includes(activePartDetailTab)) {
      showPartImage(null);
      status.textContent = `Image removed for ${partNo}.`;
      if (document.getElementById("partDetailsRows")) renderPartDetailRows();
    }
  }).catch((error) => {
    status.textContent = `Could not remove the image: ${error.message}`;
  });
}

function removePartDrawing() {
  const partNo = selectedDetailPartNo;
  const status = document.getElementById("partImageStatus") || document.getElementById("partEntryStatus");
  const drawingButton = document.getElementById("removeBasicDrawing") || document.getElementById("removeDetailDrawing");
  if (!partNo) {
    status.textContent = "Save the new part before removing a drawing.";
    return;
  }
  if (drawingButton?.disabled) return;
  deletePartDrawing(partNo).then(() => {
    if (selectedDetailPartNo === partNo && ["basic", "image"].includes(activePartDetailTab)) {
      const link = document.getElementById("partDrawingLink") || document.getElementById("basicDrawingLink");
      const name = document.getElementById("partDrawingName");
      const removeButton = document.getElementById("removeBasicDrawing") || document.getElementById("removeDetailDrawing");
      if (link) {
        link.hidden = true;
        link.removeAttribute("href");
        link.removeAttribute("download");
      }
      if (name) name.textContent = "No drawing uploaded";
      if (removeButton) removeButton.disabled = true;
      status.textContent = `Drawing removed for ${partNo}.`;
      if (document.getElementById("partDetailsRows")) renderPartDetailRows();
    }
  }).catch((error) => {
    status.textContent = `Could not remove the drawing: ${error.message}`;
  });
}

function openPartForm(index = null, returnPage = "parts") {
  const part = index === null ? null : parts[index];
  if (!part && index !== null) return;
  const showRequiredQuantity = returnPage !== "parts";
  const requiredQuantityField = showRequiredQuantity ? `
          <label for="partQuantity">Required Quantity</label>
          <input id="partQuantity" name="quantity" type="number" min="${part ? part[3] : 0}" step="1" required value="${part ? part[2] : ""}" placeholder="e.g. 20">
        ` : "";
  const bins = [...new Set(parts.map((item) => item[4]))]
    .map((bin) => `<option value="${escapeHtml(bin)}"></option>`)
    .join("");

  document.getElementById("partEditor")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="drawer-backdrop" id="partEditor" onclick="closePartForm(event)">
      <section class="part-drawer" role="dialog" aria-modal="true" aria-labelledby="partFormTitle" onclick="event.stopPropagation()">
        <div class="drawer-header">
          <div>
            <h2 id="partFormTitle">${part ? "Edit Part / Bin" : "Add Part / Bin"}</h2>
            <p>Enter the item details and its pick location.</p>
          </div>
          <button type="button" class="drawer-close" aria-label="Close" onclick="closePartForm()">&times;</button>
        </div>
        <form id="partForm" class="part-form" data-index="${index === null ? "" : index}" data-return-page="${returnPage}">
          <label for="partNumber">Part Number</label>
          <input id="partNumber" name="partNumber" required maxlength="80" value="${escapeHtml(part ? part[0] : "")}" placeholder="e.g. PN-2001">
          <label for="partDescription">Item / Description</label>
          <input id="partDescription" name="description" required maxlength="120" value="${escapeHtml(part ? part[1] : "")}" placeholder="e.g. Prototype Component">
          ${requiredQuantityField}
          <label for="partAvailableQty">Available Qty</label>
          <input id="partAvailableQty" name="availableQty" type="number" min="0" step="1" required value="${part ? (part[5] ?? 0) : 0}" placeholder="e.g. 42">
          <label for="partBin">Bin / Location</label>
          <input id="partBin" name="bin" list="partBinOptions" required maxlength="80" value="${escapeHtml(part ? part[4] : "")}" placeholder="Select an existing bin or enter a new one">
          <datalist id="partBinOptions">${bins}</datalist>
          <p class="form-error" id="partFormError" role="alert"></p>
          <div class="drawer-actions">
            <button type="button" class="btn btn-secondary" onclick="closePartForm()">CANCEL</button>
            <button type="submit" class="btn">${part ? "SAVE CHANGES" : "ADD PART"}</button>
          </div>
        </form>
      </section>
    </div>
  `);

  const form = document.getElementById("partForm");
  form.addEventListener("submit", savePartForm);
  document.getElementById("partNumber").focus();
}

function closePartForm(event) {
  if (!event || event.target.id === "partEditor") {
    document.getElementById("partEditor")?.remove();
  }
}

function savePartForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const indexValue = form.dataset.index;
  const returnPage = form.dataset.returnPage || "parts";
  const index = indexValue === "" ? null : Number(indexValue);
  const partNumber = form.elements.partNumber.value.trim();
  const description = form.elements.description.value.trim();
  const quantity = form.elements.quantity ? Number(form.elements.quantity.value) : (index === null ? 0 : parts[index][2]);
  const availableQty = Number(form.elements.availableQty.value);
  const bin = form.elements.bin.value.trim();
  const error = document.getElementById("partFormError");
  const duplicate = parts.some((part, partIndex) => part[0].toLowerCase() === partNumber.toLowerCase() && partIndex !== index);

  if (!partNumber || !description || !bin || (form.elements.quantity && (!Number.isInteger(quantity) || quantity < (index === null ? 0 : parts[index][3]))) || !Number.isInteger(availableQty) || availableQty < 0) {
    error.textContent = "Enter the part number, description, and bin. Quantities must be whole numbers of zero or more, and required quantity cannot be less than picked.";
    return;
  }
  if (duplicate) {
    error.textContent = "That part number already exists. Enter a unique part number.";
    return;
  }

  if (index !== null && form.dataset.editConfirmed !== "true") {
    requestPartActionConfirmation("edit", parts[index][0], () => {
      if (!form.isConnected) return;
      form.dataset.editConfirmed = "true";
      savePartForm({ preventDefault() {}, currentTarget: form });
    });
    return;
  }

  if (index === null) {
    parts.push([partNumber, description, quantity, 0, bin, availableQty]);
    selectedPart = partNumber;
    if (["dashboard", "active"].includes(returnPage) && currentBOM()) {
      currentBOM().items.push({ partNumber, quantity });
    }
  } else {
    const part = parts[index];
    const wasSelected = selectedPart === part[0];
    const wasChecked = checkedParts.delete(part[0]);
    const oldPartNumber = part[0];
    const linkedDetail = partDetailItems.find((item) => item.partNo === oldPartNumber);
    if (linkedDetail) linkedDetail.partNo = partNumber;
    part[0] = partNumber;
    part[1] = description;
    part[2] = quantity;
    part[4] = bin;
    part[5] = availableQty;
    boms.forEach((bom) => bom.items.forEach((item) => {
      if (item.partNumber === oldPartNumber) item.partNumber = partNumber;
    }));
    if (["dashboard", "active"].includes(returnPage)) {
      const bomItem = currentBOM()?.items.find((item) => item.partNumber === partNumber);
      if (bomItem) bomItem.quantity = quantity;
    }
    orders.forEach((order) => {
      if (Object.prototype.hasOwnProperty.call(order.picked, oldPartNumber)) {
        order.picked[partNumber] = order.picked[oldPartNumber];
        delete order.picked[oldPartNumber];
      }
    });
    if (wasSelected) selectedPart = partNumber;
    if (wasChecked) checkedParts.add(partNumber);
  }

  save();
  document.getElementById("partEditor").remove();
  if (returnPage === "dashboard") {
    dashboard();
    requestAnimationFrame(() => scrollDashboardPartIntoView(partNumber));
  } else if (returnPage === "active") activeOrder();
  else partsPage();
}

function scrollDashboardPartIntoView(partNumber) {
  const table = document.querySelector(".dashboard-table-scroll");
  if (!table) return;

  const row = [...table.querySelectorAll("tbody tr")].find((item) => item.cells[1]?.textContent.trim() === partNumber);
  row?.scrollIntoView({ block: "nearest" });
}
function deletePartAt(index) {
  const part = parts[index];
  if (!part) return;
  requestPartActionConfirmation("delete", part[0], () => performDeletePartAt(part[0]));
}

function openManagedPartEdit(partNumber, returnPage) {
  const index = parts.findIndex((part) => part[0] === partNumber);
  if (index >= 0) openPartForm(index, returnPage);
}

function confirmManagedPartDelete(partNumber, returnPage) {
  requestPartActionConfirmation("delete", partNumber, () => performDeletePartAt(partNumber, returnPage));
}

function performDeletePartAt(partNumber, returnPage = "dashboard") {
  const index = parts.findIndex((part) => part[0] === partNumber);
  if (index < 0) return;
  parts.splice(index, 1);
  boms.forEach((bom) => {
    bom.items = bom.items.filter((item) => item.partNumber !== partNumber);
  });
  orders.forEach((order) => {
    delete order.picked[partNumber];
  });
  checkedParts.delete(partNumber);
  if (selectedPart === partNumber) selectedPart = "";
  save();
  if (returnPage === "active") activeOrder();
  else if (returnPage === "parts") partsPage();
  else dashboard();
}

function historyPage() {
  app.innerHTML = "<div class=\"page history-screen\"><div class=\"history-header\"><div><div class=\"page-title\">Pick History</div><div class=\"subtitle\">Completed picking transactions</div></div><button id=\"toggleHistoryFilters\" class=\"report-filter-toggle\" type=\"button\" aria-haspopup=\"dialog\" aria-expanded=\"false\" aria-controls=\"historyFilters\" aria-label=\"Open history filters\" title=\"Filters\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3.5 5h17l-6.5 7.2v5.3l-4 2v-7.3L3.5 5Z\"/></svg><span>Filters</span></button></div>" +
    "<dialog id=\"historyFilters\" class=\"report-filter-dialog\" aria-labelledby=\"historyFilterTitle\"><div class=\"report-filter-dialog-header\"><h2 id=\"historyFilterTitle\">History Filters</h2><button id=\"closeHistoryFilters\" class=\"report-filter-close\" type=\"button\" aria-label=\"Close filters\">&times;</button></div>" +
    "<div class=\"report-date-filters\"><label class=\"report-filter-field\"><span>Filter by</span><select id=\"historyFilterView\"><option value=\"monthly\">Monthly</option><option value=\"range\">Date Range</option></select></label>" +
    "<label id=\"historyMonthField\" class=\"report-filter-field\"><span>Month</span><select id=\"historyFilterMonth\"></select></label>" +
    "<label id=\"historyFromField\" class=\"report-filter-field\" hidden><span>From date</span><input id=\"historyFilterFrom\" type=\"text\" inputmode=\"numeric\" placeholder=\"DD-MM-YYYY\" aria-label=\"From date (DD-MM-YYYY)\"></label>" +
    "<label id=\"historyToField\" class=\"report-filter-field\" hidden><span>To date</span><input id=\"historyFilterTo\" type=\"text\" inputmode=\"numeric\" placeholder=\"DD-MM-YYYY\" aria-label=\"To date (DD-MM-YYYY)\"></label></div>" +
    "<div class=\"report-column-filters\" aria-label=\"Filter history table columns\">" +
    [["order", "Order"], ["part", "Part Number"], ["description", "Description"], ["bin", "Bin"], ["operator", "Operator"]].map(([key, label]) => "<label class=\"report-column-filter\"><span>" + label + "</span><select data-history-column=\"" + key + "\" aria-label=\"Filter by " + label + "\"><option value=\"\">All " + label + "</option></select></label>").join("") +
    "</div><div id=\"historyFilterMessage\" class=\"report-filter-message\" role=\"status\" hidden></div><div class=\"report-filter-actions\"><button id=\"cancelHistoryFilters\" class=\"btn secondary\" type=\"button\">Cancel</button><button id=\"applyHistoryFilters\" class=\"btn\" type=\"button\">Apply Filters</button></div></dialog>" +
    "<div class=\"full-panel\"><div class=\"history-table-scroll\"><table class=\"data\"><thead><tr><th>Date &amp; Time</th><th>Order</th><th>Part</th><th>Description</th><th>Bin</th><th>Qty</th><th>Operator</th></tr></thead><tbody id=\"historyRows\"></tbody></table></div><div id=\"historyRowCount\" class=\"report-row-count\" aria-live=\"polite\"></div></div></div>";

  const months = [...new Set(history.map((entry) => {
    const date = reportEntryDate(entry);
    return date ? reportMonthKey(date) : "";
  }).filter(Boolean))].sort().reverse();
  document.getElementById("historyFilterMonth").innerHTML = "<option value=\"\">All months</option>" + months.map((month) => "<option value=\"" + month + "\">" + escapeHtml(reportMonthLabel(month)) + "</option>").join("");
  renderHistoryRows();

  const dialog = document.getElementById("historyFilters");
  const toggle = document.getElementById("toggleHistoryFilters");
  const close = () => { dialog.close(); toggle.setAttribute("aria-expanded", "false"); };
  toggle.addEventListener("click", () => {
    historyFilterDraft = { view: historyFilterView, month: historyFilterMonth, from: historyFilterFrom, to: historyFilterTo, columns: { ...historyColumnFilters } };
    document.getElementById("historyFilterView").value = historyFilterDraft.view;
    document.getElementById("historyFilterMonth").value = historyFilterDraft.month;
    document.getElementById("historyFilterFrom").value = historyFilterDraft.from;
    document.getElementById("historyFilterTo").value = historyFilterDraft.to;
    document.querySelectorAll("[data-history-column]").forEach((select) => { select.value = historyFilterDraft.columns[select.dataset.historyColumn] || ""; });
    const message = document.getElementById("historyFilterMessage");
    message.textContent = "";
    message.hidden = true;
    dialog.showModal();
    toggle.setAttribute("aria-expanded", "true");
  });
  document.getElementById("closeHistoryFilters").addEventListener("click", close);
  document.getElementById("cancelHistoryFilters").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => toggle.setAttribute("aria-expanded", "false"));
  document.getElementById("historyFilterView").addEventListener("change", (event) => {
    historyFilterDraft.view = event.target.value;
    updateHistoryFilterVisibility();
  });
  document.getElementById("historyFilterMonth").addEventListener("change", (event) => { historyFilterDraft.month = event.target.value; });
  document.getElementById("historyFilterFrom").addEventListener("change", (event) => { historyFilterDraft.from = event.target.value; });
  document.getElementById("historyFilterTo").addEventListener("change", (event) => { historyFilterDraft.to = event.target.value; });
  document.querySelectorAll("[data-history-column]").forEach((select) => select.addEventListener("change", (event) => {
    historyFilterDraft.columns[event.currentTarget.dataset.historyColumn] = event.currentTarget.value;
  }));
  document.getElementById("applyHistoryFilters").addEventListener("click", () => {
    const message = document.getElementById("historyFilterMessage");
    let fromKey = "";
    let toKey = "";
    if (historyFilterDraft.view === "range") {
      if (!historyFilterDraft.from || !historyFilterDraft.to) {
        message.textContent = "Select both From date and To date before applying filters.";
        message.hidden = false;
        return;
      }
      fromKey = reportDateInputKey(historyFilterDraft.from);
      toKey = reportDateInputKey(historyFilterDraft.to);
      if (!fromKey || !toKey) {
        message.textContent = "Enter both dates in DD-MM-YYYY format using valid calendar dates.";
        message.hidden = false;
        return;
      }
      if (fromKey > toKey) {
        message.textContent = "From date must be on or before To date.";
        message.hidden = false;
        return;
      }
    }
    historyFilterView = historyFilterDraft.view;
    historyFilterMonth = historyFilterDraft.month;
    historyFilterFrom = historyFilterDraft.from;
    historyFilterTo = historyFilterDraft.to;
    historyAppliedFrom = fromKey;
    historyAppliedTo = toKey;
    Object.assign(historyColumnFilters, historyFilterDraft.columns);
    message.hidden = true;
    close();
    renderHistoryRows();
  });
  document.getElementById("historyFilterView").value = historyFilterView;
  updateHistoryFilterVisibility();
}

function updateHistoryFilterVisibility() {
  const isRange = (historyFilterDraft?.view || historyFilterView) === "range";
  document.getElementById("historyMonthField").hidden = isRange;
  document.getElementById("historyFromField").hidden = !isRange;
  document.getElementById("historyToField").hidden = !isRange;
}

function renderHistoryRows() {
  const dateFiltered = history.map((entry) => ({ entry, date: reportEntryDate(entry) })).filter(({ date }) => {
    if (!date) return false;
    const dateKey = reportDateKey(date);
    return historyFilterView === "range"
      ? dateKey >= historyAppliedFrom && dateKey <= historyAppliedTo
      : !historyFilterMonth || reportMonthKey(date) === historyFilterMonth;
  });
  const rows = dateFiltered.map(({ entry }) => ({
    entry,
    values: [String(entry.time || ""), String(entry.order || ""), String(entry.part || ""), String(entry.desc || ""), String(entry.bin || ""), String(entry.qty ?? ""), String(entry.operator || "")]
  }));
  const filters = [["order", 1], ["part", 2], ["description", 3], ["bin", 4], ["operator", 6]];
  filters.forEach(([key, index]) => {
    const select = document.querySelector("[data-history-column=\"" + key + "\"]");
    const options = [...new Set(rows.map(({ values }) => values[index]))].sort((a, b) => a.localeCompare(b));
    if (historyColumnFilters[key] && !options.includes(historyColumnFilters[key])) historyColumnFilters[key] = "";
    select.innerHTML = "<option value=\"\">All " + select.closest(".report-column-filter").querySelector("span").textContent + "</option>" + options.map((value) => "<option value=\"" + escapeHtml(value) + "\">" + escapeHtml(value) + "</option>").join("");
    select.value = historyColumnFilters[key];
  });
  const filtered = rows.filter(({ values }) => filters.every(([key, index]) => !historyColumnFilters[key] || values[index] === historyColumnFilters[key]));
  document.getElementById("historyRows").innerHTML = filtered.map(({ values }) => "<tr>" + values.map((value) => "<td>" + escapeHtml(value) + "</td>").join("") + "</tr>").join("") || "<tr><td colspan=\"7\" class=\"empty-state\">No pick records match the selected filters.</td></tr>";
  document.getElementById("historyRowCount").textContent = "Showing " + filtered.length + " " + (filtered.length === 1 ? "record" : "records");
}
function reportsPage() {
  reportView = "all";
  reportMonth = "";
  reportFrom = "";
  reportTo = "";
  appliedReportFrom = "";
  appliedReportTo = "";
  reportRangeApplied = false;
  reportDraft = null;
  Object.keys(reportColumnFilters).forEach((key) => { reportColumnFilters[key] = ""; });
  app.innerHTML = `
    <div class="page reports-screen">
      <div class="reports-header">
        <div>
          <div class="page-title">Reports</div>
          <div class="subtitle">Part requirements and picking progress</div>
        </div>
        <button id="toggleReportFilters" class="report-filter-toggle" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="reportFilters" aria-label="Open report filters" title="Filters">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5h17l-6.5 7.2v5.3l-4 2v-7.3L3.5 5Z"/></svg>
          <span>Filters</span>
        </button>
      </div>
      <dialog id="reportFilters" class="report-filter-dialog" aria-labelledby="reportFilterTitle">
        <div class="report-filter-dialog-header">
          <h2 id="reportFilterTitle">Report Filters</h2>
          <button id="closeReportFilters" class="report-filter-close" type="button" aria-label="Close filters">&times;</button>
        </div>
        <div class="report-date-filters">
          <label class="report-filter-field">
            <span>Filter by</span>
            <select id="reportView">
              <option value="all">All Records</option>
              <option value="monthly">Monthly</option>
              <option value="range">Date Range</option>
            </select>
          </label>
          <label id="reportMonthField" class="report-filter-field">
            <span>Month</span>
            <select id="reportMonth"></select>
          </label>
          <label id="reportFromField" class="report-filter-field" hidden>
            <span>From date</span>
            <input id="reportFrom" type="text" inputmode="numeric" placeholder="DD-MM-YYYY" aria-label="From date (DD-MM-YYYY)" value="${escapeHtml(reportFrom)}">
          </label>
          <label id="reportToField" class="report-filter-field" hidden>
            <span>To date</span>
            <input id="reportTo" type="text" inputmode="numeric" placeholder="DD-MM-YYYY" aria-label="To date (DD-MM-YYYY)" value="${escapeHtml(reportTo)}">
          </label>
        </div>
        <div class="report-column-filters" aria-label="Filter report table columns">
          ${[
            ["order", "Order"],
            ["part", "Part Number"],
            ["description", "Description"],
            ["bin", "Bin"],
            ["operator", "Operator"]
          ].map(([key, label]) => `
            <label class="report-column-filter">
              <span>${label}</span>
              <select data-report-column="${key}" aria-label="Filter by ${label}">
                <option value="">All ${label}</option>
              </select>
            </label>
          `).join("")}
        </div>
        <div id="reportFilterMessage" class="report-filter-message" role="status" hidden></div>
        <div class="report-filter-actions">
          <button id="cancelReportFilters" class="btn secondary" type="button">Cancel</button>
          <button id="applyReportFilters" class="btn" type="button">Apply Filters</button>
        </div>
      </dialog>
      <div class="report-cards">
        <div class="card">
          <h4>Total Required</h4>
          <div class="big" id="reportRequired">0</div>
        </div>
        <div class="card green">
          <h4>Total Picked</h4>
          <div class="big" id="reportPicked">0</div>
        </div>
        <div class="card orange">
          <h4>Total Pending</h4>
          <div class="big" id="reportPending">0</div>
        </div>
        <div class="card">
          <h4>Progress</h4>
          <div class="big" id="reportProgress">0%</div>
        </div>
      </div>
      <div class="full-panel">
        <div id="reportTable"></div>
      </div>
    </div>
  `;

  const months = [...new Set(history.map((entry) => {
    const date = reportEntryDate(entry);
    return date ? reportMonthKey(date) : "";
  }).filter(Boolean))].sort().reverse();
  document.getElementById("reportMonth").innerHTML = `
    <option value="">All months</option>
    ${months.map((month) => `<option value="${month}">${escapeHtml(reportMonthLabel(month))}</option>`).join("")}
  `;
  const filterDialog = document.getElementById("reportFilters");
  const toggleFilterButton = document.getElementById("toggleReportFilters");
  toggleFilterButton.addEventListener("click", () => {
    reportDraft = {
      view: reportView,
      month: reportMonth,
      from: reportFrom,
      to: reportTo,
      columns: { ...reportColumnFilters }
    };
    document.getElementById("reportView").value = reportDraft.view;
    document.getElementById("reportMonth").value = reportDraft.month;
    document.getElementById("reportFrom").value = reportDraft.from;
    document.getElementById("reportTo").value = reportDraft.to;
    document.querySelectorAll("[data-report-column]").forEach((select) => {
      select.value = reportDraft.columns[select.dataset.reportColumn] || "";
    });
    const message = document.getElementById("reportFilterMessage");
    message.textContent = "";
    message.hidden = true;
    filterDialog.showModal();
    toggleFilterButton.setAttribute("aria-expanded", "true");
  });
  const closeFilterDialog = () => {
    filterDialog.close();
    toggleFilterButton.setAttribute("aria-expanded", "false");
  };
  document.getElementById("closeReportFilters").addEventListener("click", closeFilterDialog);
  document.getElementById("cancelReportFilters").addEventListener("click", closeFilterDialog);
  filterDialog.addEventListener("click", (event) => {
    if (event.target === filterDialog) closeFilterDialog();
  });
  filterDialog.addEventListener("close", () => {
    toggleFilterButton.setAttribute("aria-expanded", "false");
  });
  document.getElementById("reportView").addEventListener("change", (event) => {
    reportDraft.view = event.target.value;
    updateReportFilterVisibility();
  });
  document.getElementById("reportMonth").addEventListener("change", (event) => {
    reportDraft.month = event.target.value;
  });
  document.getElementById("reportFrom").addEventListener("change", (event) => {
    reportDraft.from = event.target.value;
  });
  document.getElementById("reportTo").addEventListener("change", (event) => {
    reportDraft.to = event.target.value;
  });
  document.querySelectorAll("[data-report-column]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.reportColumn;
      reportDraft.columns[key] = event.currentTarget.value;
    });
  });
  document.getElementById("applyReportFilters").addEventListener("click", () => {
    const message = document.getElementById("reportFilterMessage");
    let fromKey = "";
    let toKey = "";
    if (reportDraft.view === "range") {
      if (!reportDraft.from || !reportDraft.to) {
        message.textContent = "Select both From date and To date before applying filters.";
        message.hidden = false;
        return;
      }
      fromKey = reportDateInputKey(reportDraft.from);
      toKey = reportDateInputKey(reportDraft.to);
      if (!fromKey || !toKey) {
        message.textContent = "Enter both dates in DD-MM-YYYY format using valid calendar dates.";
        message.hidden = false;
        return;
      }
      if (fromKey > toKey) {
        message.textContent = "From date must be on or before To date.";
        message.hidden = false;
        return;
      }
    }

    reportView = reportDraft.view;
    reportMonth = reportDraft.month;
    reportFrom = reportDraft.from;
    reportTo = reportDraft.to;
    Object.assign(reportColumnFilters, reportDraft.columns);
    reportRangeApplied = reportView === "range";
    appliedReportFrom = fromKey;
    appliedReportTo = toKey;
    message.hidden = true;
    closeFilterDialog();
    updateReports();
  });
  updateReportFilterVisibility();
  updateReports();
}

function reportDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reportDateInputKey(value) {
  const match = String(value).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year)
      || date.getMonth() !== Number(month) - 1
      || date.getDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

function reportDateTimeLabel(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year} ${date.toLocaleTimeString()}`;
}

function reportMonthKey(date) {
  return reportDateKey(date).slice(0, 7);
}

function reportEntryDate(entry) {
  if (entry.timestamp) {
    const timestamp = new Date(entry.timestamp);
    if (!Number.isNaN(timestamp.getTime())) return timestamp;
  }
  if (!entry.time) return null;

  const localized = String(entry.time).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (localized) {
    const [, first, second, year, hour = "0", minute = "0", secondPart = "0", meridiem = ""] = localized;
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    let monthFirst;
    if (firstNumber > 12) monthFirst = false;
    else if (secondNumber > 12) monthFirst = true;
    else {
      const dateParts = new Intl.DateTimeFormat().formatToParts(new Date(2000, 10, 22));
      monthFirst = dateParts.findIndex((part) => part.type === "month")
        < dateParts.findIndex((part) => part.type === "day");
    }
    const month = monthFirst ? firstNumber : secondNumber;
    const day = monthFirst ? secondNumber : firstNumber;
    let hours = Number(hour);
    if (meridiem.toUpperCase() === "PM" && hours < 12) hours += 12;
    if (meridiem.toUpperCase() === "AM" && hours === 12) hours = 0;
    const date = new Date(Number(year), month - 1, day, hours, Number(minute), Number(secondPart));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(entry.time);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reportMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function updateReportFilterVisibility() {
  const view = reportDraft?.view || reportView;
  const isMonthly = view === "monthly";
  const isRange = view === "range";
  document.getElementById("reportMonthField").hidden = !isMonthly;
  document.getElementById("reportFromField").hidden = !isRange;
  document.getElementById("reportToField").hidden = !isRange;
}

function updateReports() {
  const isRange = reportView === "range";
  const isMonthly = reportView === "monthly";

  if (isRange && !reportRangeApplied) {
    updateReportSummary([], false);
    renderReportTransactions([]);
    return;
  }

  const datedHistory = history.map((entry) => ({ entry, date: reportEntryDate(entry) }));
  const filtered = datedHistory.filter(({ date }) => {
    if (isRange && !date) return false;
    if (!isRange && (!isMonthly || !reportMonth)) return true;
    if (!date) return false;
    const dateKey = reportDateKey(date);
    return isRange
      ? dateKey >= appliedReportFrom && dateKey <= appliedReportTo
      : reportMonthKey(date) === reportMonth;
  });
  const partByNumber = new Map(parts.map((part) => [String(part[0]), part]));
  const rows = filtered.map(({ entry, date }) => {
    const part = partByNumber.get(String(entry.part || ""));
    const required = part ? Number(part[2]) || 0 : 0;
    const picked = Number(entry.qty) || 0;
    return {
      entry,
      date,
      values: [
        date ? reportDateTimeLabel(date) : String(entry.time || ""),
        String(entry.order || ""),
        String(entry.part || ""),
        String(entry.desc || part?.[1] || ""),
        String(required),
        String(picked),
        String(Math.max(0, required - (part ? Number(part[3]) || 0 : 0))),
        String(entry.bin || part?.[4] || ""),
        String(entry.operator || "")
      ]
    };
  });
  const filters = [
    ["order", 1],
    ["part", 2],
    ["description", 3],
    ["bin", 7],
    ["operator", 8]
  ];
  filters.forEach(([key, columnIndex]) => {
    const select = document.querySelector(`[data-report-column="${key}"]`);
    const selectedValue = reportColumnFilters[key];
    const options = [...new Set(rows.map(({ values }) => values[columnIndex]))].sort((a, b) => a.localeCompare(b));
    if (selectedValue && !options.includes(selectedValue)) reportColumnFilters[key] = "";
    select.innerHTML = `
      <option value="">All ${select.closest(".report-column-filter").querySelector("span").textContent}</option>
      ${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}
    `;
    select.value = reportColumnFilters[key];
  });
  const visibleRows = rows.filter(({ values }) => {
    return filters.every(([key, index]) => !reportColumnFilters[key] || values[index] === reportColumnFilters[key]);
  });
  const hasColumnFilters = Object.values(reportColumnFilters).some(Boolean);
  const useCurrentPickCounts = !hasColumnFilters && (reportView === "all" || (reportView === "monthly" && !reportMonth));
  updateReportSummary(visibleRows, useCurrentPickCounts);
  renderReportTransactions(visibleRows);
}

function updateReportSummary(filtered, useCurrentPickCounts) {
  const pickedByPart = new Map();
  filtered.forEach(({ entry }) => {
    const partNumber = String(entry.part || "");
    pickedByPart.set(partNumber, (pickedByPart.get(partNumber) || 0) + (Number(entry.qty) || 0));
  });
  const reportParts = parts.map((part) => {
    const picked = useCurrentPickCounts
      ? Number(part[3]) || 0
      : pickedByPart.get(String(part[0])) || 0;
    return [part[0], part[1], part[2], picked, part[4]];
  });
  const required = reportParts.reduce((total, part) => total + (Number(part[2]) || 0), 0);
  const picked = reportParts.reduce((total, part) => total + (Number(part[3]) || 0), 0);
  const pending = required - picked;
  const progress = required ? Math.round((picked / required) * 100) : 0;

  document.getElementById("reportRequired").textContent = String(required);
  document.getElementById("reportPicked").textContent = String(picked);
  document.getElementById("reportPending").textContent = String(pending);
  document.getElementById("reportProgress").textContent = `${progress}%`;
}

function renderReportTransactions(filtered) {
  document.getElementById("reportTable").innerHTML = `
    <div class="history-table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th>Date &amp; Time Picked</th>
            <th>Order</th>
            <th>Part Number</th>
            <th>Description</th>
            <th>Required</th>
            <th>Picked</th>
            <th>Pending</th>
            <th>Bin</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(({ values }) => `
            <tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>
          `).join("") || '<tr><td colspan="9" class="empty-state">No pick records match the selected filter.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div id="reportRowCount" class="report-row-count" aria-live="polite"></div>`;
  document.getElementById("reportRowCount").textContent = `Showing ${filtered.length} ${filtered.length === 1 ? "record" : "records"}`;
}

function settingsPage() {
  app.innerHTML = `
    <div class="page">
      <div class="page-title">Settings</div>
      <div class="subtitle">Operator and USB-RS485 adapter connection settings</div>
      <div class="full-panel">
        <div class="form-grid">
          <label>Picked By</label>
          <input id="setOperator" value="${settings.operator}">
          <label>COM Port</label>
          <input id="setCom" list="availableComPorts" value="${settings.com}" placeholder="COM5, COM6, etc.">
          <datalist id="availableComPorts"></datalist>
          <label>Baud Rate</label>
          <select id="setBaud">
            <option>9600</option>
            <option>19200</option>
            <option>38400</option>
            <option>115200</option>
          </select>
        </div>
        <div class="actions">
          <button class="btn" onclick="saveSettings()">SAVE SETTINGS</button>
          <button class="btn secondary" type="button" onclick="loadSerialPorts()">REFRESH PORTS</button>
        </div>
        <p class="settings-notice" id="hardwareSettingsNotice">
          Serial adapter: waiting for connection.
        </p>
        <section class="hardware-monitor" aria-labelledby="hardwareMonitorTitle">
          <div class="hardware-monitor-heading">
            <div>
              <h3 id="hardwareMonitorTitle">Receive Monitor</h3>
              <p>Read-only serial data from the adapter. No commands are sent to the PCB.</p>
            </div>
            <button class="btn secondary" type="button" onclick="clearHardwareRxLog()">CLEAR LOG</button>
          </div>
          <div class="hardware-rx-log" id="hardwareRxLog" role="log" aria-live="polite"></div>
        </section>
      </div>
    </div>
  `;
  loadSerialPorts();
  updateHardwareStatus(hardwareStatus);
  const log = document.getElementById("hardwareRxLog");
  if (log) log.innerHTML = hardwareRxLogMarkup();
}

function saveSettings() {
  settings.operator = document.getElementById("setOperator").value;
  settings.com = document.getElementById("setCom").value.trim().toUpperCase();
  settings.baud = document.getElementById("setBaud").value;
  save();
  settingsPage();
  connectHardware();
}

function customBOM() {
  app.innerHTML = `
    <div class="page dashboard-subpage">
      <div class="page-title">Custom BOM</div>
      <div class="subtitle">Prototype custom BOM builder</div>
      <div class="full-panel">
        <div class="form-grid">
          <label>BOM Name</label>
          <input placeholder="Enter BOM name">
          <label>Customer</label>
          <input placeholder="Customer name">
          <label>Notes</label>
          <input placeholder="Notes">
        </div>
        <div class="actions">
          <button class="btn" onclick="alert('Custom BOM saved in prototype mode.')">SAVE CUSTOM BOM</button>
        </div>
      </div>
    </div>
  `;
}

function favorites() {
  app.innerHTML = `
    <div class="page dashboard-subpage">
      <div class="page-title">Favorites</div>
      <div class="subtitle">Frequently used parts</div>
      <div class="full-panel">
        <p>PN-1006 - Relay 12V</p>
        <p>PN-1002 - Terminal Pin</p>
      </div>
    </div>
  `;
}

dashboard();
connectHardware();
