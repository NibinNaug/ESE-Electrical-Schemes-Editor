(() => {
  const languageButton = document.querySelector('.lang-toggle');
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-nav');
  const titleByLanguage = {
    fr: 'ESE — Electrical Schematics Enlightener',
    en: 'ESE — Electrical Schematics Enlightener',
  };
  const descriptionByLanguage = {
    fr: 'ESE — Electrical Schematics Enlightener : transformez vos schémas techniques en documents interactifs, portables et partageables.',
    en: 'ESE — Electrical Schematics Enlightener: turn technical drawings into interactive, portable and shareable documents.',
  };

  function setLanguage(language) {
    const selected = language === 'en' ? 'en' : 'fr';
    document.documentElement.lang = selected;
    document.title = titleByLanguage[selected];
    document.querySelector('meta[name="description"]').content = descriptionByLanguage[selected];

    document.querySelectorAll('[data-fr][data-en]').forEach((element) => {
      element.textContent = element.dataset[selected];
    });

    languageButton.textContent = selected === 'fr' ? 'EN' : 'FR';
    languageButton.setAttribute(
      'aria-label',
      selected === 'fr' ? languageButton.dataset.nextLabelEn : languageButton.dataset.nextLabelFr,
    );
    localStorage.setItem('ese-site-language', selected);
  }

  languageButton.addEventListener('click', () => {
    setLanguage(document.documentElement.lang === 'fr' ? 'en' : 'fr');
  });

  menuButton.addEventListener('click', () => {
    const isOpen = navigation.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });

  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      navigation.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header')) {
      navigation.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    }
  });

  document.querySelector('#year').textContent = String(new Date().getFullYear());
  setLanguage(localStorage.getItem('ese-site-language') || 'fr');
})();
