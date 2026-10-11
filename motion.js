// Reduce-motion preference: shared by every page, saved on this device.
// "reduce" forces calm; otherwise the device setting (prefers-reduced-motion) still applies.
(function () {
  var KEY = 'somos-reino-motion';
  var root = document.documentElement;
  function saved() { try { return localStorage.getItem(KEY) === 'reduce'; } catch (e) { return false; } }
  function apply() { root.classList.toggle('reduce-motion', saved()); }
  apply();
  window.SomosMotion = {
    get: saved,
    set: function (on) {
      try { if (on) localStorage.setItem(KEY, 'reduce'); else localStorage.removeItem(KEY); } catch (e) {}
      apply();
    },
    // True when motion should be minimised, from either the site setting or the device
    reduced: function () {
      return saved() || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  };
})();
