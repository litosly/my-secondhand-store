/**
 * Fetch items.json and render each item as a card.
 * Image list → first image shown in gallery; click reveals the rest (simple lightbox fallback).
 */
async function init() {
    try {
        const res = await fetch('data/items.json');
        const items = await res.json();
        render(items);
    } catch (err) {
        console.error('Failed to load items:', err);
        document.getElementById('gallery').textContent = 'Unable to load items.';
    }
}

function render(items) {
    const gallery = document.getElementById('gallery');
    items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'card';
        const firstImage = item.imgs[0];
        card.innerHTML = `
        <img src="images/${firstImage}" alt="${item.name}" loading="lazy" />
        <div class="body">
          <h3>${item.name}</h3>
          <p>${item.desc}</p>
        </div>
      `;
        card.addEventListener('click', () => openLightbox(item));
        gallery.appendChild(card);
    });
}

/* ultra-simple lightbox */
function openLightbox(item) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.8);
      display:flex;align-items:center;justify-content:center;z-index:9999;`;
    overlay.addEventListener('click', () => overlay.remove());

    const img = document.createElement('img');
    img.src = `images/${item.imgs[0]}`;
    img.style.maxWidth = '90vw';
    img.style.maxHeight = '90vh';
    overlay.appendChild(img);

    document.body.appendChild(overlay);
}

init();
