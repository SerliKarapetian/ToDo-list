const inputBox = document.getElementById("input-box");
const listContainer = document.getElementById("list-container");
const addBtn = document.getElementById("add-btn");
const taskCountEl = document.getElementById("task-count");

function addTask() {
  const taskText = inputBox.value.trim();
  if (!taskText) {
    showNotification("Please enter a task!", "error");
    return;
  }
  if (taskText.length > 100) {
    showNotification("Task is too long (max 100 characters)!", "error");
    return;
  }

  const li = document.createElement("li");
  li.textContent = taskText;
  li.setAttribute("role", "listitem");

  const span = document.createElement("span");
  span.textContent = "\u00d7";
  span.setAttribute("aria-label", "Delete task");
  li.appendChild(span);

  listContainer.appendChild(li);
  inputBox.value = "";
  saveData();
  updateTaskCount();
  showNotification("Task added!", "success");
}

function handleTaskInteraction(e) {
  if (e.target.tagName === "LI") {
    e.target.classList.toggle("checked");
    saveData();
    updateTaskCount();
  } else if (e.target.tagName === "SPAN") {
    e.target.parentElement.remove();
    saveData();
    updateTaskCount();
    showNotification("Task deleted!", "success");
  }
}

function saveData() {
  localStorage.setItem("data", listContainer.innerHTML);
}

function loadTasks() {
  const savedData = localStorage.getItem("data");
  if (savedData) {
    listContainer.innerHTML = savedData;
  }
  updateTaskCount();
}

function updateTaskCount() {
  const taskCount = listContainer.querySelectorAll("li:not(.checked)").length;
  taskCountEl.textContent = taskCount;
}

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.className = `notification notification--${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  requestAnimationFrame(() => {
    notification.style.transform = "translateX(0)";
  });

  setTimeout(() => {
    notification.style.transform = "translateX(100%)";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// Event Listeners
addBtn.addEventListener("click", addTask);
inputBox.addEventListener("keypress", (e) => {
  if (e.key === "Enter") addTask();
});
listContainer.addEventListener("click", handleTaskInteraction);

// Initialize
loadTasks();

// Add notification styles
const style = document.createElement("style");
style.textContent = `
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 8px;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 500;
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }
  .notification--success {
    background: #28a745;
  }
  .notification--error {
    background: #dc3545;
  }
`;
document.head.appendChild(style);
