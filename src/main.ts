// ?marbles=1 shows the marble style sheet (no scene, no camera); anything else starts the app.
if (new URLSearchParams(location.search).get('marbles') === '1') {
  void import('./marblesheet').then((m) => m.showSheet());
} else {
  void import('./app');
}
