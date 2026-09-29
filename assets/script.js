const inputBox = document.getElementById("input-box");
const listContainer = document.getElementById("list-container");
const addBtn = document.getElementById("add-btn");

function addTask() {
  const taskText = inputBox.value.trim();
  if (!taskText) {
    alert("Please enter a task!");
    return;
  }
  if (taskText.length > 100) {
    alert("Task is too long (max 100 characters)!");
    return;
  }

  const li = document.createElement("li");
  li.textContent = taskText; // Use textContent for security
  li.setAttribute("role", "listitem");

  const span = document.createElement("span");
  span.textContent = "\u00d7";
  span.setAttribute("aria-label", "Delete task");
  li.appendChild(span);

  listContainer.appendChild(li);
  inputBox.value = "";
  saveData();
}

function handleTaskInteraction(e) {
  if (e.target.tagName === "LI") {
    e.target.classList.toggle("checked");
    saveData();
  } else if (e.target.tagName === "SPAN") {
    e.target.parentElement.remove();
    saveData();
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
}

// Event Listeners
addBtn.addEventListener("click", addTask);
inputBox.addEventListener("keypress", (e) => {
  if (e.key === "Enter") addTask();
});
listContainer.addEventListener("click", handleTaskInteraction);

// Initialize
loadTasks();
