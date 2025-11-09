/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const searchInput = document.getElementById("searchInput");

// keep track of selected products (store product objects: {id, name, brand, image})
let selectedProducts = [];
// cache of last displayed products so we can look up details by id
let lastDisplayedProducts = [];

// Add after the existing global variables
let conversationHistory = [];
const chatInput = document.getElementById("userInput");

/* Add Cloudflare worker URL constant */
const workerUrl = "https://loreal-routine.aebake03.workers.dev/";

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  // cache products for later lookup
  lastDisplayedProducts = products;

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card${
      selectedProducts.some((p) => p.id === product.id) ? " selected" : ""
    }" tabindex="0" data-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
      <div class="desc-overlay" role="region" aria-label="Product description" tabindex="0">
        <p class="description-text">${product.description}</p>
      </div>
    </div>
  `
    )
    .join("");

  // attach event handlers to new cards
  attachProductCardHandlers();
}

function attachProductCardHandlers() {
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    const id = Number(card.getAttribute("data-id"));

    // Use element-level handlers to avoid attaching duplicates on re-render
    card.onclick = (e) => {
      // toggle selection on activation (mouse or keyboard)
      toggleProductSelectionById(id);

      // If this was a mouse click (e.detail > 0), blur any focused elements
      // so :focus-within no longer keeps the overlay visible when the cursor moves away.
      // Keyboard activations (Enter/Space) usually produce e.detail === 0; don't blur then.
      try {
        if (e && e.detail && e.detail > 0) {
          // blur overlay if it has focus
          const overlay = card.querySelector(".desc-overlay");
          if (overlay && typeof overlay.blur === "function") overlay.blur();
          // blur the card itself
          setTimeout(() => card.blur(), 0);
        }
      } catch (err) {
        /* ignore */
      }
    };

    // keyboard support: Enter or Space toggles selection (do not blur)
    card.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleProductSelectionById(id);
      }
    };
  });
}

// Load selected products from localStorage on page load
function loadSelectedProducts() {
  const saved = localStorage.getItem("selectedProducts");
  if (saved) {
    selectedProducts = JSON.parse(saved);
    renderSelectedProductsList();
  }
}

// Save selected products to localStorage
function saveSelectedProducts() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
}

// Clear all selected products
function clearAllSelections() {
  selectedProducts = [];
  saveSelectedProducts();
  // Remove selected class from all product cards
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => card.classList.remove("selected"));
  renderSelectedProductsList();
}

function toggleProductSelectionById(id) {
  const existingIndex = selectedProducts.findIndex((p) => p.id === id);
  if (existingIndex !== -1) {
    // remove
    selectedProducts.splice(existingIndex, 1);
  } else {
    // find product details from cached list
    const prod = lastDisplayedProducts.find((p) => p.id === id);
    if (prod) {
      selectedProducts.push({
        id: prod.id,
        name: prod.name,
        brand: prod.brand,
        image: prod.image,
      });
    }
  }

  // update UI
  updateProductCardSelectionState(id);
  renderSelectedProductsList();

  // Save changes to localStorage
  saveSelectedProducts();
}

function updateProductCardSelectionState(id) {
  const card = productsContainer.querySelector(
    `.product-card[data-id="${id}"]`
  );
  if (!card) return;
  const isSelected = selectedProducts.some((p) => p.id === id);
  card.classList.toggle("selected", isSelected);
}

function renderSelectedProductsList() {
  if (!selectedProductsList) return;
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="placeholder-message">No products selected</p>
    `;
    return;
  }

  // Remove existing Clear All button if it exists
  const existingClearBtn = document.querySelector("#clearAll");
  if (existingClearBtn) {
    existingClearBtn.remove();
  }

  selectedProductsList.innerHTML = `
    ${selectedProducts
      .map(
        (p) => `
      <div class="selected-item" data-id="${p.id}">
        <img src="${p.image}" alt="${p.name}" />
        <div class="meta">
          <div class="name">${p.name}</div>
          <div class="brand">${p.brand}</div>
        </div>
        <button class="remove-btn" aria-label="Remove ${p.name}">×</button>
      </div>
    `
      )
      .join("")}
  `;

  // attach remove handlers
  selectedProductsList.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parent = btn.closest(".selected-item");
      const id = Number(parent.getAttribute("data-id"));

      // remove from selectedProducts
      selectedProducts = selectedProducts.filter((p) => p.id !== id);

      // update UI for the product card
      updateProductCardSelectionState(id);

      // save to localStorage
      saveSelectedProducts();

      // re-render the selected products list
      renderSelectedProductsList();
    });
  });

  // Inject Clear All button after the list but before Generate Routine
  const clearBtn = document.createElement("button");
  clearBtn.id = "clearAll";
  clearBtn.className = "clear-all-btn";
  clearBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Clear All Products';
  clearBtn.addEventListener("click", clearAllSelections);

  // Insert before the Generate Routine button
  const generateBtn = document.querySelector("#generateRoutine");
  generateBtn.parentNode.insertBefore(clearBtn, generateBtn);
}

/* Filter products by both category and search term */
async function filterProducts() {
  const products = await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchTerm = searchInput.value.toLowerCase().trim();

  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory
      ? product.category === selectedCategory
      : true;
    const matchesSearch = searchTerm
      ? product.name.toLowerCase().includes(searchTerm) ||
        product.brand.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm)
      : true;

    return matchesCategory && matchesSearch;
  });

  displayProducts(filteredProducts);
}

/* Update event listeners */
categoryFilter.addEventListener("change", filterProducts);
searchInput.addEventListener("input", filterProducts);

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = chatInput.value.trim();
  if (!userMessage) return;

  // Clear input immediately
  chatInput.value = "";

  // Add user message to history
  conversationHistory.push({
    role: "user",
    content: userMessage,
  });

  // Show updated chat history including user's message
  chatWindow.innerHTML = formatChatHistory(conversationHistory);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  // Add "Thinking..." message
  const thinkingMsg = document.createElement("p");
  thinkingMsg.textContent = "Thinking...";
  chatWindow.appendChild(thinkingMsg);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    // Include max_tokens parameter and ensure system message is included
    const messages = [
      {
        role: "system",
        content: `You are a helpful skincare and haircare routine assistant. Help users understand their personalized routine and answer questions about skincare, haircare, makeup, and beauty in general. Keep responses friendly and informative.`,
      },
      ...conversationHistory,
    ];

    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Handle both direct response format and OpenAI response format
    const aiResponse =
      (data?.choices && data.choices[0]?.message?.content) ||
      data?.result ||
      data?.content ||
      "I couldn't process that response.";

    // Add AI response to history
    conversationHistory.push({
      role: "assistant",
      content: aiResponse,
    });

    // Remove thinking message and show formatted response
    chatWindow.removeChild(thinkingMsg);
    chatWindow.innerHTML = formatChatHistory(conversationHistory);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    // Clear input
    chatInput.value = "";
  } catch (err) {
    console.error("Chat error:", err);
    // Remove thinking message and show error
    chatWindow.removeChild(thinkingMsg);
    chatWindow.innerHTML = formatChatHistory(conversationHistory);
    const errorMsg = document.createElement("p");
    errorMsg.textContent = "An error occurred. Please try again.";
    chatWindow.appendChild(errorMsg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
});

// Update generate routine handler to initialize conversation
generateRoutineBtn?.addEventListener("click", async () => {
  // Clear previous conversation
  conversationHistory = [];

  if (!selectedProducts || selectedProducts.length === 0) {
    chatWindow.textContent =
      "Please select at least one product to generate a routine.";
    return;
  }

  chatWindow.textContent = "Generating routine...";

  try {
    // ensure we have full product details (name, brand, category, description)
    const allProducts = await loadProducts();
    const selectedFull = selectedProducts
      .map((p) => allProducts.find((ap) => ap.id === p.id) || p)
      .map((p) => ({
        name: p.name,
        brand: p.brand,
        category: p.category,
        description: p.description,
      }));

    // build messages for the worker / OpenAI
    const messages = [
      {
        role: "system",
        content: `You are a helpful skincare and haircare routine assistant. Given a list of products, create a well-structured routine following these rules:

Format sections exactly like this:
**Morning Routine:**
**Evening Routine:**
**Weekly Routine:**

For each product include:
1. Product Name — Brand (in italics)
  • Purpose: One short sentence
  • Usage: 1-2 brief bullet points

Keep descriptions concise and avoid marketing language.
Use clear line breaks between sections.`,
      },
      {
        role: "user",
        content: `Here are the selected products:\n${JSON.stringify(
          selectedFull,
          null,
          2
        )}\n\nPlease generate a personalized routine that uses these products.`,
      },
    ];

    // Initialize conversation with system message but DON'T add the product list message
    conversationHistory = [
      {
        role: "system",
        content: `You are a helpful skincare and haircare routine assistant. Help users understand their personalized routine and answer questions about skincare, haircare, makeup, and beauty in general. Keep responses friendly and informative.`,
      },
    ];

    const resp = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_tokens: 800 }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP error generating routine: ${resp.status}`);
    }

    const data = await resp.json();

    const aiTextRaw =
      (data?.choices && data.choices[0]?.message?.content) ||
      data?.result ||
      data?.content ||
      JSON.stringify(data);

    // Add only the AI response to conversation history
    conversationHistory.push({
      role: "assistant",
      content: aiTextRaw,
    });

    const aiText = formatAiResponse(aiTextRaw, selectedFull);
    chatWindow.innerHTML = aiText;
  } catch (err) {
    console.error(err);
    chatWindow.textContent = "Failed to generate routine. Please try again.";
  }
});

// Add helper function to format chat history
function formatChatHistory(history) {
  return history
    .filter((msg) => msg.role !== "system") // Don't show system messages
    .map((msg) => {
      const content =
        msg.role === "assistant"
          ? formatAiResponse(msg.content, selectedProducts)
          : `<p class="user-message"><strong>You:</strong> ${escapeHtml(
              msg.content
            )}</p>`;
      return content;
    })
    .join("");
}

// Helper functions (add these before the event handlers)
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimToLastSentence(text) {
  if (!text) return text;
  const trimmed = text.trim();
  const lastChar = trimmed[trimmed.length - 1];
  if (/[.!?]\"?'?\)]?$/.test(lastChar)) return trimmed;

  const idx = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?")
  );
  if (idx === -1) return trimmed;
  return trimmed.slice(0, idx + 1);
}

function formatAiResponse(text, products) {
  if (!text) return "";
  const safeTrimmed = trimToLastSentence(text);

  let out = escapeHtml(safeTrimmed);

  if (Array.isArray(products)) {
    products.forEach((p) => {
      if (!p || !p.name) return;
      const escapedName = escapeHtml(p.name);
      const re = new RegExp(escapeRegExp(escapedName), "g");
      out = out.replace(re, `<em>${escapedName}</em>`);
    });
  }

  out = out
    .split(/\n\n+/)
    .map((para) => para.replace(/\n/g, "<br>"))
    .map((para) => `<p>${para}</p>`)
    .join("");

  out = out.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  return out;
}

// Load saved selections when page loads
document.addEventListener("DOMContentLoaded", loadSelectedProducts);
