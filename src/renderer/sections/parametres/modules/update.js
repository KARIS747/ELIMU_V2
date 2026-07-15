/**
 * update.js - Gestion du module de mise à jour (renderer)
 */

import { t } from '../../../locales/index.js';

export async function initUpdate() {
  const btnCheck = document.getElementById('btn-check-updates');
  const btnInstall = document.getElementById('btn-install-update');
  const versionDisplay = document.getElementById('app-version-display');
  const statusContainer = document.getElementById('update-status-container');
  const statusMessage = document.getElementById('update-status-message');
  const statusIcon = document.getElementById('update-status-icon');
  const spinner = document.getElementById('update-spinner');
  const progressContainer = document.getElementById('update-progress-container');
  const progressBar = document.getElementById('update-progress-bar');
  const progressPercent = document.getElementById('update-progress-percent');
  const progressSpeed = document.getElementById('update-progress-speed');
  const actionsContainer = document.getElementById('update-actions');

  // Load current version
  try {
    const version = await window.elimuAPI.getAppVersion();
    versionDisplay.textContent = `v${version}`;
  } catch (err) {
    versionDisplay.textContent = 'Erreur';
    console.error('Erreur version:', err);
  }

  // Handle Check Updates button
  btnCheck.addEventListener('click', async () => {
    btnCheck.disabled = true;
    statusContainer.style.display = 'flex';
    statusMessage.textContent = t('update.status.checking');
    spinner.style.display = 'block';
    statusIcon.style.display = 'none';
    actionsContainer.style.display = 'none';
    progressContainer.style.display = 'none';

    try {
      const response = await window.elimuAPI.checkUpdates();
      if (!response.success) {
        throw new Error(response.error);
      }
    } catch (err) {
      spinner.style.display = 'none';
      statusIcon.style.display = 'block';
      statusIcon.textContent = '❌';
      statusMessage.textContent = `${t('common.error')} : ${t(err.message)}`;
      btnCheck.disabled = false;
    }
  });

  // Handle Install button
  btnInstall.addEventListener('click', () => {
    window.elimuAPI.quitAndInstall();
  });

  // Listen for status updates from main process
  window.elimuAPI.onUpdaterStatus((data) => {
    const { status, message } = data;
    
    statusContainer.style.display = 'flex';
    statusMessage.textContent = t(message);
    spinner.style.display = (status === 'checking') ? 'block' : 'none';
    statusIcon.style.display = (status === 'checking') ? 'none' : 'block';

    switch (status) {
      case 'available':
        statusIcon.textContent = '📥';
        btnCheck.disabled = true;
        break;
      case 'not-available':
        statusIcon.textContent = '✅';
        btnCheck.disabled = false;
        break;
      case 'downloaded':
        statusIcon.textContent = '✨';
        actionsContainer.style.display = 'block';
        btnCheck.disabled = false;
        break;
      case 'error':
        statusIcon.textContent = '❌';
        btnCheck.disabled = false;
        if (data.error) {
          statusMessage.textContent = `${t(message)} (${data.error})`;
        }
        break;
    }
  });

  // Listen for progress updates
  window.elimuAPI.onUpdaterProgress((progress) => {
    progressContainer.style.display = 'block';
    const percent = Math.floor(progress.percent);
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    
    // Format speed
    const speedKbs = Math.floor(progress.bytesPerSecond / 1024);
    progressSpeed.textContent = `${speedKbs} KB/s`;
  });

  // Cleanup on module unload (if necessary)
  return () => {
    window.elimuAPI.removeUpdaterListeners();
  };
}
