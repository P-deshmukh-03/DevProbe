warning: in the working copy of 'public/css/style.css', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'public/index.html', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'public/js/app.js', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/public/css/style.css b/public/css/style.css[m
[1mindex db95211..5815d09 100644[m
[1m--- a/public/css/style.css[m
[1m+++ b/public/css/style.css[m
[36m@@ -696,6 +696,81 @@[m [mhtml, body {[m
   box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);[m
 }[m
 [m
[32m+[m[32m/* --- URL Preview Bar (Day 3 Feature) --- */[m
[32m+[m[32m.url-preview-bar {[m
[32m+[m[32m  margin-top: 8px;[m
[32m+[m[32m  background-color: var(--bg-card);[m
[32m+[m[32m  border: 1px solid var(--border-subtle);[m
[32m+[m[32m  border-radius: var(--radius-sm);[m
[32m+[m[32m  padding: 6px 12px;[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  justify-content: space-between;[m
[32m+[m[32m  gap: 12px;[m
[32m+[m[32m  transition: all var(--transition-fast);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-main {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 8px;[m
[32m+[m[32m  overflow: hidden;[m
[32m+[m[32m  flex: 1;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-tag {[m
[32m+[m[32m  font-size: 9px;[m
[32m+[m[32m  font-weight: 700;[m
[32m+[m[32m  letter-spacing: 0.5px;[m
[32m+[m[32m  color: var(--accent-primary);[m
[32m+[m[32m  background-color: var(--accent-subtle);[m
[32m+[m[32m  padding: 2px 6px;[m
[32m+[m[32m  border-radius: 3px;[m
[32m+[m[32m  flex-shrink: 0;[m
[32m+[m[32m  text-transform: uppercase;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-url {[m
[32m+[m[32m  color: var(--text-primary);[m
[32m+[m[32m  white-space: nowrap;[m
[32m+[m[32m  overflow: hidden;[m
[32m+[m[32m  text-overflow: ellipsis;[m
[32m+[m[32m  font-size: 11px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-actions {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 8px;[m
[32m+[m[32m  flex-shrink: 0;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status {[m
[32m+[m[32m  font-size: 10px;[m
[32m+[m[32m  font-weight: 600;[m
[32m+[m[32m  padding: 2px 7px;[m
[32m+[m[32m  border-radius: 3px;[m
[32m+[m[32m  letter-spacing: 0.3px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status.badge-valid {[m
[32m+[m[32m  background-color: rgba(16, 185, 129, 0.15);[m
[32m+[m[32m  color: var(--status-success);[m
[32m+[m[32m  border: 1px solid rgba(16, 185, 129, 0.25);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status.badge-invalid {[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.15);[m
[32m+[m[32m  color: var(--status-error);[m
[32m+[m[32m  border: 1px solid rgba(239, 68, 68, 0.25);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status.badge-warning {[m
[32m+[m[32m  background-color: rgba(245, 158, 11, 0.15);[m
[32m+[m[32m  color: var(--status-warning);[m
[32m+[m[32m  border: 1px solid rgba(245, 158, 11, 0.25);[m
[32m+[m[32m}[m
[32m+[m
 .method-select-wrapper {[m
   position: relative;[m
   flex-shrink: 0;[m
[36m@@ -924,6 +999,42 @@[m [mhtml, body {[m
   color: var(--text-secondary);[m
 }[m
 [m
[32m+[m[32m.panel-header-actions {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 8px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/* Header & Request Validation Feedback */[m
[32m+[m[32m.validation-banner {[m
[32m+[m[32m  margin-bottom: 12px;[m
[32m+[m[32m  padding: 8px 12px;[m
[32m+[m[32m  border-radius: var(--radius-sm);[m
[32m+[m[32m  font-size: 12px;[m
[32m+[m[32m  line-height: 1.4;[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  flex-direction: column;[m
[32m+[m[32m  gap: 4px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-banner.banner-error {[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.12);[m
[32m+[m[32m  border: 1px solid rgba(239, 68, 68, 0.3);[m
[32m+[m[32m  color: #fca5a5;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-banner.banner-success {[m
[32m+[m[32m  background-color: rgba(16, 185, 129, 0.12);[m
[32m+[m[32m  border: 1px solid rgba(16, 185, 129, 0.3);[m
[32m+[m[32m  color: #86efac;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-banner.banner-warning {[m
[32m+[m[32m  background-color: rgba(245, 158, 11, 0.12);[m
[32m+[m[32m  border: 1px solid rgba(245, 158, 11, 0.3);[m
[32m+[m[32m  color: #fcd34d;[m
[32m+[m[32m}[m
[32m+[m
 /* Key-Value Tables (Params & Headers) */[m
 .table-responsive {[m
   width: 100%;[m
[36m@@ -1153,6 +1264,42 @@[m [mhtml, body {[m
   resize: vertical;[m
 }[m
 [m
[32m+[m[32m.editor-actions {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 6px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-chip {[m
[32m+[m[32m  font-size: 10px;[m
[32m+[m[32m  font-weight: 600;[m
[32m+[m[32m  padding: 2px 6px;[m
[32m+[m[32m  border-radius: 3px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-chip.chip-success {[m
[32m+[m[32m  background-color: rgba(16, 185, 129, 0.15);[m
[32m+[m[32m  color: var(--status-success);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-chip.chip-error {[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.15);[m
[32m+[m[32m  color: var(--status-error);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.json-feedback-bar {[m
[32m+[m[32m  padding: 6px 12px;[m
[32m+[m[32m  font-size: 11px;[m
[32m+[m[32m  font-family: var(--font-mono);[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.12);[m
[32m+[m[32m  color: #fca5a5;[m
[32m+[m[32m  border-bottom: 1px solid rgba(239, 68, 68, 0.25);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.auth-roadmap-notice {[m
[32m+[m[32m  margin-bottom: 4px;[m
[32m+[m[32m}[m
[32m+[m
 /* Auth Tab Styles */[m
 .auth-config-container {[m
   max-width: 600px;[m
[1mdiff --git a/public/index.html b/public/index.html[m
[1mindex 728128d..1d79093 100644[m
[1m--- a/public/index.html[m
[1m+++ b/public/index.html[m
[36m@@ -34,7 +34,7 @@[m
             </svg>[m
           </div>[m
           <span class="brand-title">DevProbe</span>[m
[31m-          <span class="badge badge-subtle">Day 2: UI Workspace</span>[m
[32m+[m[32m          <span class="badge badge-subtle">Day 3: State &amp; Config</span>[m
         </div>[m
 [m
         <div class="nav-divider" aria-hidden="true"></div>[m
[36m@@ -261,6 +261,24 @@[m
                 <span>Save</span>[m
               </button>[m
             </div>[m
[32m+[m
[32m+[m[32m            <!-- Prepared URL Preview Bar (Day 3 Feature) -->[m
[32m+[m[32m            <div class="url-preview-bar" id="url-preview-bar" aria-live="polite">[m
[32m+[m[32m              <div class="url-preview-main">[m
[32m+[m[32m                <span class="url-preview-tag">PREPARED URL</span>[m
[32m+[m[32m                <span class="url-preview-url font-mono" id="url-preview-text">https://jsonplaceholder.typicode.com/users/1</span>[m
[32m+[m[32m              </div>[m
[32m+[m[32m              <div class="url-preview-actions">[m
[32m+[m[32m                <span class="url-preview-status badge-valid" id="url-preview-status">Ready</span>[m
[32m+[m[32m                <button id="btn-copy-preview-url" class="btn-xs btn-outline" title="Copy prepared URL to clipboard">[m
[32m+[m[32m                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[32m+[m[32m                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>[m
[32m+[m[32m                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>[m
[32m+[m[warning: in the working copy of 'public/css/style.css', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'public/index.html', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'public/js/app.js', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/public/css/style.css b/public/css/style.css[m
[1mindex db95211..5815d09 100644[m
[1m--- a/public/css/style.css[m
[1m+++ b/public/css/style.css[m
[36m@@ -696,6 +696,81 @@[m [mhtml, body {[m
   box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);[m
 }[m
 [m
[32m+[m[32m/* --- URL Preview Bar (Day 3 Feature) --- */[m
[32m+[m[32m.url-preview-bar {[m
[32m+[m[32m  margin-top: 8px;[m
[32m+[m[32m  background-color: var(--bg-card);[m
[32m+[m[32m  border: 1px solid var(--border-subtle);[m
[32m+[m[32m  border-radius: var(--radius-sm);[m
[32m+[m[32m  padding: 6px 12px;[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  justify-content: space-between;[m
[32m+[m[32m  gap: 12px;[m
[32m+[m[32m  transition: all var(--transition-fast);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-main {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 8px;[m
[32m+[m[32m  overflow: hidden;[m
[32m+[m[32m  flex: 1;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-tag {[m
[32m+[m[32m  font-size: 9px;[m
[32m+[m[32m  font-weight: 700;[m
[32m+[m[32m  letter-spacing: 0.5px;[m
[32m+[m[32m  color: var(--accent-primary);[m
[32m+[m[32m  background-color: var(--accent-subtle);[m
[32m+[m[32m  padding: 2px 6px;[m
[32m+[m[32m  border-radius: 3px;[m
[32m+[m[32m  flex-shrink: 0;[m
[32m+[m[32m  text-transform: uppercase;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-url {[m
[32m+[m[32m  color: var(--text-primary);[m
[32m+[m[32m  white-space: nowrap;[m
[32m+[m[32m  overflow: hidden;[m
[32m+[m[32m  text-overflow: ellipsis;[m
[32m+[m[32m  font-size: 11px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-actions {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 8px;[m
[32m+[m[32m  flex-shrink: 0;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status {[m
[32m+[m[32m  font-size: 10px;[m
[32m+[m[32m  font-weight: 600;[m
[32m+[m[32m  padding: 2px 7px;[m
[32m+[m[32m  border-radius: 3px;[m
[32m+[m[32m  letter-spacing: 0.3px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status.badge-valid {[m
[32m+[m[32m  background-color: rgba(16, 185, 129, 0.15);[m
[32m+[m[32m  color: var(--status-success);[m
[32m+[m[32m  border: 1px solid rgba(16, 185, 129, 0.25);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status.badge-invalid {[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.15);[m
[32m+[m[32m  color: var(--status-error);[m
[32m+[m[32m  border: 1px solid rgba(239, 68, 68, 0.25);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.url-preview-status.badge-warning {[m
[32m+[m[32m  background-color: rgba(245, 158, 11, 0.15);[m
[32m+[m[32m  color: var(--status-warning);[m
[32m+[m[32m  border: 1px solid rgba(245, 158, 11, 0.25);[m
[32m+[m[32m}[m
[32m+[m
 .method-select-wrapper {[m
   position: relative;[m
   flex-shrink: 0;[m
[36m@@ -924,6 +999,42 @@[m [mhtml, body {[m
   color: var(--text-secondary);[m
 }[m
 [m
[32m+[m[32m.panel-header-actions {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 8px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/* Header & Request Validation Feedback */[m
[32m+[m[32m.validation-banner {[m
[32m+[m[32m  margin-bottom: 12px;[m
[32m+[m[32m  padding: 8px 12px;[m
[32m+[m[32m  border-radius: var(--radius-sm);[m
[32m+[m[32m  font-size: 12px;[m
[32m+[m[32m  line-height: 1.4;[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  flex-direction: column;[m
[32m+[m[32m  gap: 4px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-banner.banner-error {[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.12);[m
[32m+[m[32m  border: 1px solid rgba(239, 68, 68, 0.3);[m
[32m+[m[32m  color: #fca5a5;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-banner.banner-success {[m
[32m+[m[32m  background-color: rgba(16, 185, 129, 0.12);[m
[32m+[m[32m  border: 1px solid rgba(16, 185, 129, 0.3);[m
[32m+[m[32m  color: #86efac;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-banner.banner-warning {[m
[32m+[m[32m  background-color: rgba(245, 158, 11, 0.12);[m
[32m+[m[32m  border: 1px solid rgba(245, 158, 11, 0.3);[m
[32m+[m[32m  color: #fcd34d;[m
[32m+[m[32m}[m
[32m+[m
 /* Key-Value Tables (Params & Headers) */[m
 .table-responsive {[m
   width: 100%;[m
[36m@@ -1153,6 +1264,42 @@[m [mhtml, body {[m
   resize: vertical;[m
 }[m
 [m
[32m+[m[32m.editor-actions {[m
[32m+[m[32m  display: flex;[m
[32m+[m[32m  align-items: center;[m
[32m+[m[32m  gap: 6px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-chip {[m
[32m+[m[32m  font-size: 10px;[m
[32m+[m[32m  font-weight: 600;[m
[32m+[m[32m  padding: 2px 6px;[m
[32m+[m[32m  border-radius: 3px;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-chip.chip-success {[m
[32m+[m[32m  background-color: rgba(16, 185, 129, 0.15);[m
[32m+[m[32m  color: var(--status-success);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.validation-chip.chip-error {[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.15);[m
[32m+[m[32m  color: var(--status-error);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.json-feedback-bar {[m
[32m+[m[32m  padding: 6px 12px;[m
[32m+[m[32m  font-size: 11px;[m
[32m+[m[32m  font-family: var(--font-mono);[m
[32m+[m[32m  background-color: rgba(239, 68, 68, 0.12);[m
[32m+[m[32m  color: #fca5a5;[m
[32m+[m[32m  border-bottom: 1px solid rgba(239, 68, 68, 0.25);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.auth-roadmap-notice {[m
[32m+[m[32m  margin-bottom: 4px;[m
[32m+[m[32m}[m
[32m+[m
 /* Auth Tab Styles */[m
 .auth-config-container {[m
   max-width: 600px;[m
[1mdiff --git a/public/index.html b/public/index.html[m
[1mindex 728128d..1d79093 100644[m
[1m--- a/public/index.html[m
[1m+++ b/public/index.html[m
[36m@@ -34,7 +34,7 @@[m
             </svg>[m
           </div>[m
           <span class="brand-title">DevProbe</span>[m
[31m-          <span class="badge badge-subtle">Day 2: UI Workspace</span>[m
[32m+[m[32m          <span class="badge badge-subtle">Day 3: State &amp; Config</span>[m
         </div>[m
 [m
         <div class="nav-divider" aria-hidden="true"></div>[m
[36m@@ -261,6 +261,24 @@[m
                 <span>Save</span>[m
               </button>[m
             </div>[m
[32m+[m
[32m+[m[32m            <!-- Prepared URL Preview Bar (Day 3 Feature) -->[m
[32m+[m[32m            <div class="url-preview-bar" id="url-preview-bar" aria-live="polite">[m
[32m+[m[32m              <div class="url-preview-main">[m
[32m+[m[32m                <span class="url-preview-tag">PREPARED URL</span>[m
[32m+[m[32m                <span class="url-preview-url font-mono" id="url-preview-text">https://jsonplaceholder.typicode.com/users/1</span>[m
[32m+[m[32m              </div>[m
[32m+[m[32m              <div class="url-preview-actions">[m
[32m+[m[32m                <span class="url-preview-status badge-valid" id="url-preview-status">Ready</span>[m
[32m+[m[32m                <button id="btn-copy-preview-url" class="btn-xs btn-outline" title="Copy prepared URL to clipboard">[m
[32m+[m[32m                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[32m+[m[32m                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>[m
[32m+[m[32m                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>[m
[32m+[m[32m                  </svg>[m
[32m+[m[32m                  <span>Copy</span>[m
[32m+[m[32m                </button>[m
[32m+[m[32m              </div>[m
[32m+[m[32m            </div>[m
           </section>[m
 [m
           <!-- Request Configuration Tabs (Params, Headers, Body, Auth) -->[m
[36m@@ -318,15 +336,26 @@[m
               <div class="config-panel" id="panel-headers" role="tabpanel" aria-labelledby="tab-btn-headers">[m
                 <div class="panel-section-header">[m
                   <span class="panel-title">HTTP Request Headers</span>[m
[31m-                  <button id="btn-add-header" class="btn-sm btn-outline">[m
[31m-                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">[m
[31m-                      <line x1="12" y1="5" x2="12" y2="19"></line>[m
[31m-                      <line x1="5" y1="12" x2="19" y2="12"></line>[m
[31m-                    </svg>[m
[31m-                    Add Header[m
[31m-                  </button>[m
[32m+[m[32m                  <div class="panel-header-actions">[m
[32m+[m[32m                    <button id="btn-validate-headers" class="btn-sm btn-outline" title="Validate Header Syntax and Uniqueness">[m
[32m+[m[32m                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[32m+[m[32m                        <polyline points="20 6 9 17 4 12"></polyline>[m
[32m+[m[32m                      </svg>[m
[32m+[m[32m                      Validate Headers[m
[32m+[m[32m                    </button>[m
[32m+[m[32m                    <button id="btn-add-header" class="btn-sm btn-outline">[m
[32m+[m[32m                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">[m
[32m+[m[32m                        <line x1="12" y1="5" x2="12" y2="19"></line>[m
[32m+[m[32m                        <line x1="5" y1="12" x2="19" y2="12"></line>[m
[32m+[m[32m                      </svg>[m
[32m+[m[32m                      Add Header[m
[32m+[m[32m                    </button>[m
[32m+[m[32m                  </div>[m
                 </div>[m
 [m
[32m+[m[32m                <!-- Header Validation Message Container -->[m
[32m+[m[32m                <div id="headers-validation-msg" class="validation-banner hidden" role="alert"></div>[m
[32m+[m
                 <div class="table-responsive">[m
                   <table class="kv-table" id="headers-table">[m
                     <thead>[m
[36m@@ -379,8 +408,13 @@[m
                   <div class="body-input-area hidden" id="body-input-wrapper">[m
                     <div class="editor-header">[m
                       <span class="editor-mode-badge" id="editor-format-label">JSON Editor</span>[m
[31m-                      <button id="btn-format-json" class="btn-xs btn-ghost">Beautify JSON</button>[m
[32m+[m[32m                      <div class="editor-actions">[m
[32m+[m[32m                        <span id="json-validation-badge" class="validation-chip hidden"></span>[m
[32m+[m[32m                        <button id="btn-validate-json" class="btn-xs btn-outline">Validate JSON</button>[m
[32m+[m[32m                        <button id="btn-format-json" class="btn-xs btn-ghost">Beautify JSON</button>[m
[32m+[m[32m                      </div>[m
                     </div>[m
[32m+[m[32m                    <div id="json-validation-msg" class="json-feedback-bar hidden" role="alert"></div>[m
                     <textarea id="body-textarea" class="code-textarea" placeholder="{\n  &quot;title&quot;: &quot;foo&quot;,\n  &quot;body&quot;: &quot;bar&quot;,\n  &quot;userId&quot;: 1\n}" spellcheck="false"></textarea>[m
                   </div>[m
                 </div>[m
[36m@@ -398,6 +432,16 @@[m
                     </select>[m
                   </div>[m
 [m
[32m+[m[32m                  <!-- Authentication Notice (Day 3 / Day 5 Preparation) -->[m
[32m+[m[32m                  <div class="auth-roadmap-notice info-callout">[m
[32m+[m[32m                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[32m+[m[32m                      <circle cx="12" cy="12" r="10"></circle>[m
[32m+[m[32m                      <line x1="12" y1="16" x2="12" y2="12"></line>[m
[32m+[m[32m                      <line x1="12" y1="8" x2="12.01" y2="8"></line>[m
[32m+[m[32m                    </svg>[m
[32m+[m[32m                    <span>Authentication credentials will be securely formatted and applied to request headers when the execution engine is connected in Day 5. Passwords and tokens are kept in temporary memory and are never saved to disk or URLs.</span>[m
[32m+[m[32m                  </div>[m
[32m+[m
                   <!-- Auth Option: None -->[m
                   <div class="auth-subpanel" id="auth-subpanel-none">[m
                     <div class="info-callout">[m
[36m@@ -553,7 +597,7 @@[m
         <span class="status-separator">/</span>[m
         <span class="status-indicator">[m
           <span class="status-dot"></span>[m
[31m-          <span>Frontend UI Ready (Day 2)</span>[m
[32m+[m[32m          <span>Request Config &amp; State Engine Ready (Day 3)</span>[m
         </span>[m
       </div>[m
 [m
[1mdiff --git a/public/js/app.js b/public/js/app.js[m
[1mindex 84e9066..9a1d9cb 100644[m
[1m--- a/public/js/app.js[m
[1m+++ b/public/js/app.js[m
[36m@@ -1,30 +1,569 @@[m
 /**[m
  * DevProbe — Frontend Application Script[m
[31m- * Day 2: Professional Developer Workspace UI[m
[32m+[m[32m * Day 3: Request Configuration and State Management[m
  *[m
[31m- * This script manages interactive UI states for DevProbe:[m
[31m- * - Tab switching (request configuration & response inspector)[m
[31m- * - Dynamic parameter and header row additions/removals[m
[31m- * - HTTP method selector and badge synchronization[m
[31m- * - Sidebar search filtering and drawer collapsing[m
[31m- * - Sample request selection and editor synchronization[m
[31m- * - Toast notification messaging for placeholder actions[m
[32m+[m[32m * This script provides centralized state management for HTTP requests in DevProbe:[m
[32m+[m[32m * - Centralized JavaScript request state (URL, method, params, headers, body, auth, env)[m
[32m+[m[32m * - Safe URL query parameter preparation, encoding, and live preview[m
[32m+[m[32m * - Environment variable resolution (e.g. {{base_url}}) with error reporting[m
[32m+[m[32m * - Client-side HTTP header validation (RFC 7230 compliant, case-insensitive duplicate detection)[m
[32m+[m[32m * - JSON body validation and beautification with error preservation[m
[32m+[m[32m * - In-memory authentication management (zero credential persistence in storage/URLs)[m
[32m+[m[32m * - Complete Day 2 UI synchronization (sidebar, tabs, tables, toasts, response viewer)[m
  */[m
 [m
[31m-document.addEventListener('DOMContentLoaded', () => {[m
[31m-  // Initialize all application components[m
[31m-  initTabs();[m
[31m-  initKeyValueTables();[m
[31m-  initBodyTypeSelector();[m
[31m-  initAuthTypeSelector();[m
[31m-  initMethodSelector();[m
[31m-  initSidebar();[m
[31m-  initActionButtons();[m
[31m-  initResponseViewer();[m
[31m-});[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   1. Environment Configuration and Variable Resolution[m
[32m+[m[32m   ========================================================================== */[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Predefined demonstration environments and sample variable mappings.[m
[32m+[m[32m * Kept separate from the active request state.[m
[32m+[m[32m */[m
[32m+[m[32mconst ENVIRONMENTS = {[m
[32m+[m[32m  none: {[m
[32m+[m[32m    name: 'No Environment',[m
[32m+[m[32m    variables: {}[m
[32m+[m[32m  },[m
[32m+[m[32m  dev: {[m
[32m+[m[32m    name: 'Development (Local)',[m
[32m+[m[32m    variables: {[m
[32m+[m[32m      base_url: 'http://localhost:3000',[m
[32m+[m[32m      api_version: 'v1',[m
[32m+[m[32m      port: '3000'[m
[32m+[m[32m    }[m
[32m+[m[32m  },[m
[32m+[m[32m  staging: {[m
[32m+[m[32m    name: 'Staging',[m
[32m+[m[32m    variables: {[m
[32m+[m[32m      base_url: 'https://staging.api.example.com',[m
[32m+[m[32m      api_version: 'v1',[m
[32m+[m[32m      timeout_ms: '5000'[m
[32m+[m[32m    }[m
[32m+[m[32m  },[m
[32m+[m[32m  prod: {[m
[32m+[m[32m    name: 'Production',[m
[32m+[m[32m    variables: {[m
[32m+[m[32m      base_url: 'https://api.example.com',[m
[32m+[m[32m      api_version: 'v1'[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m[32m};[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Look up an environment variable by name in a specified environment.[m
[32m+[m[32m * @param {string} envKey - The environment key ('none'|'dev'|'staging'|'prod')[m
[32m+[m[32m * @param {string} varName - The variable name to look up[m
[32m+[m[32m * @returns {string|undefined} The resolved variable value or undefined if not found[m
[32m+[m[32m */[m
[32m+[m[32mfunction getEnvironmentVariable(envKey, varName) {[m
[32m+[m[32m  if (!envKey || !ENVIRONMENTS[envKey]) return undefined;[m
[32m+[m[32m  const env = ENVIRONMENTS[envKey];[m
[32m+[m[32m  if (env.variables && Object.prototype.hasOwnProperty.call(env.variables, varName)) {[m
[32m+[m[32m    return env.variables[varName];[m
[32m+[m[32m  }[m
[32m+[m[32m  return undefined;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Replaces {{variable_name}} placeholders in a string using the selected environment.[m
[32m+[m[32m * Reports missing variables without silently converting them to empty strings.[m
[32m+[m[32m * @param {string} input - The string containing {{variable}} placeholders[m
[32m+[m[32m * @param {string} envKey - The active environment key[m
[32m+[m[32m * @returns {{ resolvedText: string, missingVariables: string[], substituted: boolean }}[m
[32m+[m[32m */[m
[32m+[m[32mfunction resolveVariables(input, envKey) {[m
[32m+[m[32m  if (typeof input !== 'string' || !input) {[m
[32m+[m[32m    return { resolvedText: input || '', missingVariables: [], substituted: false };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const missingVariables = [];[m
[32m+[m[32m  let substituted = false;[m
[32m+[m
[32m+[m[32m  // Regex pattern matching {{var_name}}[m
[32m+[m[32m  const placeholderRegex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;[m
[32m+[m
[32m+[m[32m  const resolvedText = input.replace(placeholderRegex, (match, varName) => {[m
[32m+[m[32m    const val = getEnvironmentVariable(envKey, varName);[m
[32m+[m[32m    if (val !== undefined) {[m
[32m+[m[32m      substituted = true;[m
[32m+[m[32m      return val;[m
[32m+[m[32m    }[m
[32m+[m[32m    // Variable is missing in this environment[m
[32m+[m[32m    if (!missingVariables.includes(varName)) {[m
[32m+[m[32m      missingVariables.push(varName);[m
[32m+[m[32m    }[m
[32m+[m[32m    // Retain placeholder so user can see what failed to resolve[m
[32m+[m[32m    return match;[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32m  return {[m
[32m+[m[32m    resolvedText,[m
[32m+[m[32m    missingVariables,[m
[32m+[m[32m    substituted[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   2. Centralized Request State[m
[32m+[m[32m   ========================================================================== */[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * The single source of truth for the active request currently being configured.[m
[32m+[m[32m * DOM controls synchronize with this state structure.[m
[32m+[m[32m */[m
[32m+[m[32mconst activeRequest = {[m
[32m+[m[32m  id: 'req-1',[m
[32m+[m[32m  name: 'Get User Profile',[m
[32m+[m[32m  method: 'GET',[m
[32m+[m[32m  url: 'https://jsonplaceholder.typicode.com/users/1',[m
[32m+[m[32m  params: [[m
[32m+[m[32m    // Initial parameter placeholder row[m
[32m+[m[32m    { id: 'param-init', key: '', value: '', description: '', enabled: false }[m
[32m+[m[32m  ],[m
[32m+[m[32m  headers: [[m
[32m+[m[32m    { id: 'hdr-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true },[m
[32m+[m[32m    { id: 'hdr-2', key: 'User-Agent', value: 'DevProbe/1.0', description: 'Client identifier', enabled: true }[m
[32m+[m[32m  ],[m
[32m+[m[32m  body: {[m
[32m+[m[32m    type: 'none', // 'none' | 'json' | 'text'[m
[32m+[m[32m    text: ''[m
[32m+[m[32m  },[m
[32m+[m[32m  auth: {[m
[32m+[m[32m    type: 'none', // 'none' | 'bearer' | 'basic'[m
[32m+[m[32m    bearerToken: '',[m
[32m+[m[32m    basicUsername: '',[m
[32m+[m[32m    basicPassword: ''[m
[32m+[m[32m  },[m
[32m+[m[32m  selectedEnvironment: 'none'[m
[32m+[m[32m};[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Preset sample request configurations for collections and demo history.[m
[32m+[m[32m */[m
[32m+[m[32mconst SAMPLE_REQUEST_TEMPLATES = {[m
[32m+[m[32m  'req-1': {[m
[32m+[m[32m    name: 'Get User Profile',[m
[32m+[m[32m    method: 'GET',[m
[32m+[m[32m    url: 'https://jsonplaceholder.typicode.com/users/1',[m
[32m+[m[32m    params: [[m
[32m+[m[32m      { id: 'p-1', key: '', value: '', description: '', enabled: false }[m
[32m+[m[32m    ],[m
[32m+[m[32m    headers: [[m
[32m+[m[32m      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true },[m
[32m+[m[32m      { id: 'h-2', key: 'User-Agent', value: 'DevProbe/1.0', description: 'Client identifier', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    body: { type: 'none', text: '' },[m
[32m+[m[32m    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m  },[m
[32m+[m[32m  'req-2': {[m
[32m+[m[32m    name: 'Create New Post',[m
[32m+[m[32m    method: 'POST',[m
[32m+[m[32m    url: 'https://jsonplaceholder.typicode.com/posts',[m
[32m+[m[32m    params: [[m
[32m+[m[32m      { id: 'p-1', key: '', value: '', description: '', enabled: false }[m
[32m+[m[32m    ],[m
[32m+[m[32m    headers: [[m
[32m+[m[32m      { id: 'h-1', key: 'Content-Type', value: 'application/json', description: 'JSON payload format', enabled: true },[m
[32m+[m[32m      { id: 'h-2', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    body: {[m
[32m+[m[32m      type: 'json',[m
[32m+[m[32m      text: '{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}'[m
[32m+[m[32m    },[m
[32m+[m[32m    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m  },[m
[32m+[m[32m  'req-3': {[m
[32m+[m[32m    name: 'Remove Item',[m
[32m+[m[32m    method: 'DELETE',[m
[32m+[m[32m    url: 'https://jsonplaceholder.typicode.com/posts/1',[m
[32m+[m[32m    params: [[m
[32m+[m[32m      { id: 'p-1', key: '', value: '', description: '', enabled: false }[m
[32m+[m[32m    ],[m
[32m+[m[32m    headers: [[m
[32m+[m[32m      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    body: { type: 'none', text: '' },[m
[32m+[m[32m    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m  },[m
[32m+[m[32m  'hist-1': {[m
[32m+[m[32m    name: 'Get Users List',[m
[32m+[m[32m    method: 'GET',[m
[32m+[m[32m    url: 'https://jsonplaceholder.typicode.com/users',[m
[32m+[m[32m    params: [[m
[32m+[m[32m      { id: 'p-1', key: 'limit', value: '10', description: 'Page limit', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    headers: [[m
[32m+[m[32m      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    body: { type: 'none', text: '' },[m
[32m+[m[32m    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m  },[m
[32m+[m[32m  'hist-2': {[m
[32m+[m[32m    name: 'Login Authenticate',[m
[32m+[m[32m    method: 'POST',[m
[32m+[m[32m    url: 'https://jsonplaceholder.typicode.com/posts',[m
[32m+[m[32m    params: [],[m
[32m+[m[32m    headers: [[m
[32m+[m[32m      { id: 'h-1', key: 'Content-Type', value: 'application/json', description: 'JSON payload', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    body: {[m
[32m+[m[32m      type: 'json',[m
[32m+[m[32m      text: '{\n  "username": "demo",\n  "password": "secretPassword"\n}'[m
[32m+[m[32m    },[m
[32m+[m[32m    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m  },[m
[32m+[m[32m  'hist-3': {[m
[32m+[m[32m    name: 'Check Server Health',[m
[32m+[m[32m    method: 'GET',[m
[32m+[m[32m    url: 'http://localhost:3000/api/health',[m
[32m+[m[32m    params: [],[m
[32m+[m[32m    headers: [[m
[32m+[m[32m      { id: 'h-1', key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }[m
[32m+[m[32m    ],[m
[32m+[m[32m    body: { type: 'none', text: '' },[m
[32m+[m[32m    auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m  }[m
[32m+[m[32m};[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Generate a unique ID for state rows[m
[32m+[m[32m */[m
[32m+[m[32mfunction generateRowId(prefix = 'item') {[m
[32m+[m[32m  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   3. Request URL Handling and Query Parameter Preparation[m
[32m+[m[32m   ========================================================================== */[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Prepares the final request URL without executing any network requests.[m
[32m+[m[32m * Safely resolves environment variables, preserves existing query params,[m
[32m+[m[32m * appends enabled query parameters from state, and validates the URL syntax.[m
[32m+[m[32m *[m
[32m+[m[32m * @param {string} rawUrl - Base URL string (may contain query parameters or {{var}} tags)[m
[32m+[m[32m * @param {Array<{ key: string, value: string, enabled: boolean }>} params - Array of parameter rows[m
[32m+[m[32m * @param {string} envKey - Active environment key[m
[32m+[m[32m * @returns {{ isValid: boolean, url: string, error?: string, missingVariables?: string[] }}[m
[32m+[m[32m */[m
[32m+[m[32mfunction prepareRequestUrl(rawUrl, params = [], envKey = 'none') {[m
[32m+[m[32m  // 1. Check for presence of URL[m
[32m+[m[32m  if (!rawUrl || !rawUrl.trim()) {[m
[32m+[m[32m    return {[m
[32m+[m[32m      isValid: false,[m
[32m+[m[32m      url: '',[m
[32m+[m[32m      error: 'URL is required'[m
[32m+[m[32m    };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const trimmed = rawUrl.trim();[m
[32m+[m
[32m+[m[32m  // 2. Resolve environment variables in the URL[m
[32m+[m[32m  const { resolvedText, missingVariables } = resolveVariables(trimmed, envKey);[m
[32m+[m[32m  if (missingVariables.length > 0) {[m
[32m+[m[32m    return {[m
[32m+[m[32m      isValid: false,[m
[32m+[m[32m      url: resolvedText,[m
[32m+[m[32m      error: `Missing environment variable: {{${missingVariables.join(', ')}}}`,[m
[32m+[m[32m      missingVariables[m
[32m+[m[32m    };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // 3. Parse base URL safely using the standard URL API[m
[32m+[m[32m  let parsedUrl;[m
[32m+[m[32m  let isRelative = false;[m
[32m+[m
[32m+[m[32m  try {[m
[32m+[m[32m    // Attempt standard absolute URL parsing[m
[32m+[m[32m    parsedUrl = new URL(resolvedText);[m
[32m+[m[32m  } catch (err) {[m
[32m+[m[32m    // If it starts with / or is relative, parse against window origin or localhost placeholder[m
[32m+[m[32m    if (resolvedText.startsWith('/') || resolvedText.startsWith('./')) {[m
[32m+[m[32m      try {[m
[32m+[m[32m        const dummyOrigin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')[m
[32m+[m[32m          ? window.location.origin[m
[32m+[m[32m          : 'http://localhost:3000';[m
[32m+[m[32m        parsedUrl = new URL(resolvedText, dummyOrigin);[m
[32m+[m[32m        isRelative = true;[m
[32m+[m[32m      } catch (relErr) {[m
[32m+[m[32m        return {[m
[32m+[m[32m          isValid: false,[m
[32m+[m[32m          url: resolvedText,[m
[32m+[m[32m          error: 'Invalid relative URL syntax'[m
[32m+[m[32m        };[m
[32m+[m[32m      }[m
[32m+[m[32m    } else {[m
[32m+[m[32m      // Missing protocol or malformed scheme[m
[32m+[m[32m      return {[m
[32m+[m[32m        isValid: false,[m
[32m+[m[32m        url: resolvedText,[m
[32m+[m[32m        error: 'Invalid URL syntax. URL must include a protocol (e.g. https:// or http://)'[m
[32m+[m[32m      };[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // 4. Apply enabled query parameters from request state[m
[32m+[m[32m  if (Array.isArray(params)) {[m
[32m+[m[32m    params.forEach((param) => {[m
[32m+[m[32m      // Must be enabled[m
[32m+[m[32m      if (!param || !param.enabled) return;[m
[32m+[m
[32m+[m[32m      // Key must be present and not purely whitespace[m
[32m+[m[32m      if (typeof param.key !== 'string' || !param.key.trim()) return;[m
[32m+[m
[32m+[m[32m      // Resolve variables in key and value[m
[32m+[m[32m      const keyResolved = resolveVariables(param.key.trim(), envKey).resolvedText;[m
[32m+[m[32m      const rawVal = param.value !== undefined && param.value !== null ? String(param.value) : '';[m
[32m+[m[32m      const valResolved = resolveVariables(rawVal, envKey).resolvedText;[m
[32m+[m
[32m+[m[32m      // Append parameter preserving existing parameters and handling special characters[m
[32m+[m[32m      parsedUrl.searchParams.append(keyResolved, valResolved);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // 5. Construct final prepared URL string[m
[32m+[m[32m  const finalUrl = isRelative[m
[32m+[m[32m    ? `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`[m
[32m+[m[32m    : parsedUrl.toString();[m
[32m+[m
[32m+[m[32m  return {[m
[32m+[m[32m    isValid: true,[m
[32m+[m[32m    url: finalUrl[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Updates the URL preview bar in the UI.[m
[32m+[m[32m * Does not modify the user's raw input in the request-url input box.[m
[32m+[m[32m */[m
[32m+[m[32mfunction updateUrlPreview() {[m
[32m+[m[32m  if (typeof document === 'undefined') return;[m
[32m+[m[32m  const previewText = document.getElementById('url-preview-text');[m
[32m+[m[32m  const previewStatus = document.getElementById('url-preview-status');[m
[32m+[m[32m  if (!previewText || !previewStatus) return;[m
[32m+[m
[32m+[m[32m  const result = prepareRequestUrl([m
[32m+[m[32m    activeRequest.url,[m
[32m+[m[32m    activeRequest.params,[m
[32m+[m[32m    activeRequest.selectedEnvironment[m
[32m+[m[32m  );[m
[32m+[m
[32m+[m[32m  if (result.isValid) {[m
[32m+[m[32m    previewText.textContent = result.url;[m
[32m+[m[32m    previewText.title = result.url;[m
[32m+[m[32m    previewStatus.textContent = 'Ready';[m
[32m+[m[32m    previewStatus.className = 'url-preview-status badge-valid';[m
[32m+[m[32m  } else {[m
[32m+[m[32m    previewText.textContent = result.url || '(No URL provided)';[m
[32m+[m[32m    previewText.title = result.error || 'Invalid URL';[m
[32m+[m[32m    previewStatus.textContent = result.error || 'Invalid';[m
[32m+[m[32m    previewStatus.className = 'url-preview-status badge-invalid';[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   4. HTTP Header Validation[m
[32m+[m[32m   ========================================================================== */[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Validates HTTP request headers on the client side according to RFC 7230 token rules.[m
[32m+[m[32m * Detects empty header names, invalid header name characters, and duplicate headers case-insensitively.[m
[32m+[m[32m *[m
[32m+[m[32m * @param {Array<{ key: string, value: string, enabled: boolean }>} headers[m
[32m+[m[32m * @param {boolean} showToastFeedback - Whether to show a toast message on manual validation[m
[32m+[m[32m * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}[m
[32m+[m[32m */[m
[32m+[m[32mfunction validateHeaders(headers, showToastFeedback = false) {[m
[32m+[m[32m  const errors = [];[m
[32m+[m[32m  const warnings = [];[m
[32m+[m[32m  const seenHeaderNames = new Map(); // lowercase -> originalName[m
[32m+[m
[32m+[m[32m  // RFC 7230 token characters: 1*tchar[m
[32m+[m[32m  // tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA[m
[32m+[m[32m  const validHeaderNamePattern = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;[m
[32m+[m
[32m+[m[32m  if (Array.isArray(headers)) {[m
[32m+[m[32m    headers.forEach((header, index) => {[m
[32m+[m[32m      // Ignore disabled header rows[m
[32m+[m[32m      if (!header || !header.enabled) return;[m
[32m+[m
[32m+[m[32m      const rawKey = header.key !== undefined && header.key !== null ? String(header.key) : '';[m
[32m+[m[32m      const trimmedKey = rawKey.trim();[m
[32m+[m[32m      const rowNum = index + 1;[m
[32m+[m
[32m+[m[32m      // 1. Reject empty header name[m
[32m+[m[32m      if (!trimmedKey) {[m
[32m+[m[32m        errors.push(`Row ${rowNum}: Header name cannot be empty when enabled.`);[m
[32m+[m[32m        return;[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      // 2. Reject invalid header name characters (spaces, colons, non-token characters)[m
[32m+[m[32m      if (!validHeaderNamePattern.test(trimmedKey)) {[m
[32m+[m[32m        errors.push(`Row ${rowNum}: Invalid header name "${trimmedKey}". Header names cannot contain spaces, colons, or control characters.`);[m
[32m+[m[32m        return;[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      // 3. Detect duplicate header names case-insensitively[m
[32m+[m[32m      const lowerKey = trimmedKey.toLowerCase();[m
[32m+[m[32m      if (seenHeaderNames.has(lowerKey)) {[m
[32m+[m[32m        const originalName = seenHeaderNames.get(lowerKey);[m
[32m+[m[32m        errors.push(`Duplicate header "${trimmedKey}" detected (conflicts with "${originalName}"). Headers are case-insensitive.`);[m
[32m+[m[32m      } else {[m
[32m+[m[32m        seenHeaderNames.set(lowerKey, trimmedKey);[m
[32m+[m[32m      }[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const isValid = errors.length === 0;[m
[32m+[m
[32m+[m[32m  // Update UI validation banner in the Headers panel[m
[32m+[m[32m  const banner = typeof document !== 'undefined' ? document.getElementById('headers-validation-msg') : null;[m
[32m+[m[32m  if (banner) {[m
[32m+[m[32m    if (!isValid) {[m
[32m+[m[32m      banner.className = 'validation-banner banner-error';[m
[32m+[m[32m      banner.innerHTML = `<strong>Header Validation Issues:</strong><ul style="margin:4px 0 0 16px;padding:0;">${errors.map((e) => `<li>${e}</li>`).join('')}</ul>`;[m
[32m+[m[32m      banner.classList.remove('hidden');[m
[32m+[m[32m    } else {[m
[32m+[m[32m      banner.className = 'validation-banner banner-success';[m
[32m+[m[32m      banner.innerHTML = '<strong>Headers Valid:</strong> All enabled headers conform to standard HTTP token specifications.';[m
[32m+[m[32m      banner.classList.remove('hidden');[m
[32m+[m
[32m+[m[32m      // Auto-hide success message after 3.5 seconds[m
[32m+[m[32m      setTimeout(() => {[m
[32m+[m[32m        if (banner.classList.contains('banner-success')) {[m
[32m+[m[32m          banner.classList.add('hidden');[m
[32m+[m[32m        }[m
[32m+[m[32m      }, 3500);[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (showToastFeedback) {[m
[32m+[m[32m    if (isValid) {[m
[32m+[m[32m      showToast('Headers Validated', 'All active request headers are valid.', 'success');[m
[32m+[m[32m    } else {[m
[32m+[m[32m      showToast('Header Validation Error', errors[0], 'warning');[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  return {[m
[32m+[m[32m    isValid,[m
[32m+[m[32m    errors,[m
[32m+[m[32m    warnings[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   5. JSON Body Validation and Beautification[m
[32m+[m[32m   ========================================================================== */[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Validates request body text if JSON mode is active.[m
[32m+[m[32m * Uses JSON.parse() safely inside try/catch and preserves user's original text on error.[m
[32m+[m[32m *[m
[32m+[m[32m * @param {string} text - Request body payload[m
[32m+[m[32m * @param {string} bodyType - Active body type ('none'|'json'|'text')[m
[32m+[m[32m * @param {boolean} showToastFeedback - Whether to trigger toast notification[m
[32m+[m[32m * @returns {{ isValid: boolean, message: string, parsed?: any }}[m
[32m+[m[32m */[m
[32m+[m[32mfunction validateJsonBody(text, bodyType = 'json', showToastFeedback = false) {[m
[32m+[m[32m  const badge = typeof document !== 'undefined' ? document.getElementById('json-validation-badge') : null;[m
[32m+[m[32m  const feedbackMsg = typeof document !== 'undefined' ? document.getElementById('json-validation-msg') : null;[m
[32m+[m
[32m+[m[32m  // If not JSON body mode, skip JSON validation[m
[32m+[m[32m  if (bodyType !== 'json') {[m
[32m+[m[32m    if (badge) badge.classList.add('hidden');[m
[32m+[m[32m    if (feedbackMsg) feedbackMsg.classList.add('hidden');[m
[32m+[m[32m    return { isValid: true, message: 'Non-JSON body mode active; validation skipped.' };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const trimmed = (text || '').trim();[m
[32m+[m
[32m+[m[32m  // If empty, it's valid empty payload[m
[32m+[m[32m  if (!trimmed) {[m
[32m+[m[32m    if (badge) {[m
[32m+[m[32m      badge.textContent = 'Empty Payload';[m
[32m+[m[32m      badge.className = 'validation-chip';[m
[32m+[m[32m      badge.classList.remove('hidden');[m
[32m+[m[32m    }[m
[32m+[m[32m    if (feedbackMsg) feedbackMsg.classList.add('hidden');[m
[32m+[m[32m    if (showToastFeedback) {[m
[32m+[m[32m      showToast('JSON Body', 'Body payload is currently empty.', 'info');[m
[32m+[m[32m    }[m
[32m+[m[32m    return { isValid: true, message: 'Payload is empty.' };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  try {[m
[32m+[m[32m    const parsed = JSON.parse(trimmed);[m
[32m+[m
[32m+[m[32m    if (badge) {[m
[32m+[m[32m      badge.textContent = 'Valid JSON';[m
[32m+[m[32m      badge.className = 'validation-chip chip-success';[m
[32m+[m[32m      badge.classList.remove('hidden');[m
[32m+[m[32m    }[m
[32m+[m[32m    if (feedbackMsg) {[m
[32m+[m[32m      feedbackMsg.classList.add('hidden');[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    if (showToastFeedback) {[m
[32m+[m[32m      showToast('Valid JSON', 'JSON payload parsed successfully with zero syntax errors.', 'success');[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    return {[m
[32m+[m[32m      isValid: true,[m
[32m+[m[32m      message: 'Valid JSON format.',[m
[32m+[m[32m      parsed[m
[32m+[m[32m    };[m
[32m+[m[32m  } catch (err) {[m
[32m+[m[32m    const errMsg = `JSON Parse Error: ${err.message}`;[m
[32m+[m
[32m+[m[32m    if (badge) {[m
[32m+[m[32m      badge.textContent = 'Invalid JSON';[m
[32m+[m[32m      badge.className = 'validation-chip chip-error';[m
[32m+[m[32m      badge.classList.remove('hidden');[m
[32m+[m[32m    }[m
[32m+[m[32m    if (feedbackMsg) {[m
[32m+[m[32m      feedbackMsg.textContent = errMsg;[m
[32m+[m[32m      feedbackMsg.classList.remove('hidden');[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    if (showToastFeedback) {[m
[32m+[m[32m      showToast('Invalid JSON Payload', err.message, 'warning');[m
[32m+[m[32m    }[m
[32m+[m
[32m+[m[32m    return {[m
[32m+[m[32m      isValid: false,[m
[32m+[m[32m      message: errMsg[m
[32m+[m[32m    };[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Beautifies JSON payload using JSON.stringify(parsed, null, 2).[m
[32m+[m[32m * Preserves user's original text if JSON is invalid.[m
[32m+[m[32m */[m
[32m+[m[32mfunction beautifyJsonBody() {[m
[32m+[m[32m  const bodyTextarea = document.getElementById('body-textarea');[m
[32m+[m[32m  if (!bodyTextarea) return;[m
[32m+[m
[32m+[m[32m  const currentText = bodyTextarea.value;[m
[32m+[m[32m  const result = validateJsonBody(currentText, 'json', false);[m
[32m+[m
[32m+[m[32m  if (result.isValid && result.parsed !== undefined) {[m
[32m+[m[32m    const formatted = JSON.stringify(result.parsed, null, 2);[m
[32m+[m[32m    bodyTextarea.value = formatted;[m
[32m+[m[32m    activeRequest.body.text = formatted;[m
[32m+[m[32m    showToast('JSON Beautified', 'Formatted body payload successfully.', 'success');[m
[32m+[m[32m  } else if (!currentText.trim()) {[m
[32m+[m[32m    showToast('Beautify JSON', 'Cannot beautify empty JSON payload.', 'info');[m
[32m+[m[32m  } else {[m
[32m+[m[32m    // Preserve user's original text![m
[32m+[m[32m    showToast('Cannot Beautify JSON', result.message, 'warning');[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
 [m
 /* ==========================================================================[m
[31m-   1. Toast Notification System[m
[32m+[m[32m   6. Toast Notification System[m
    ========================================================================== */[m
 [m
 /**[m
[36m@@ -40,7 +579,6 @@[m [mfunction showToast(title, message, type = 'info') {[m
   const toast = document.createElement('div');[m
   toast.className = `toast toast-${type}`;[m
 [m
[31m-  // Icon based on type[m
   const iconSvg = type === 'warning'[m
     ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'[m
     : type === 'success'[m
[36m@@ -95,222 +633,330 @@[m [mfunction removeToast(toast) {[m
 }[m
 [m
 /* ==========================================================================[m
[31m-   2. Request Configuration and Response Tabs[m
[32m+[m[32m   7. Synchronizing State with the User Interface[m
    ========================================================================== */[m
 [m
[31m-function initTabs() {[m
[31m-  // Request Config Tabs (Params, Headers, Body, Auth)[m
[31m-  const configTabs = document.querySelectorAll('.config-tab');[m
[31m-  configTabs.forEach((tab) => {[m
[31m-    tab.addEventListener('click', () => {[m
[31m-      const targetTab = tab.getAttribute('data-tab');[m
[31m-[m
[31m-      // Update tab button states[m
[31m-      configTabs.forEach((t) => {[m
[31m-        t.classList.remove('active');[m
[31m-        t.setAttribute('aria-selected', 'false');[m
[31m-      });[m
[31m-      tab.classList.add('active');[m
[31m-      tab.setAttribute('aria-selected', 'true');[m
[32m+[m[32m/**[m
[32m+[m[32m * Loads a structured request configuration into activeRequest state and renders it to the DOM.[m
[32m+[m[32m */[m
[32m+[m[32mfunction loadRequestIntoState(template) {[m
[32m+[m[32m  if (!template) return;[m
[32m+[m
[32m+[m[32m  activeRequest.name = template.name || 'Untitled Request';[m
[32m+[m[32m  activeRequest.method = template.method || 'GET';[m
[32m+[m[32m  activeRequest.url = template.url || '';[m
[32m+[m
[32m+[m[32m  // Deep copy params & headers to avoid mutating original templates[m
[32m+[m[32m  activeRequest.params = Array.isArray(template.params)[m
[32m+[m[32m    ? template.params.map((p) => ({ ...p, id: p.id || generateRowId('param') }))[m
[32m+[m[32m    : [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }];[m
[32m+[m
[32m+[m[32m  activeRequest.headers = Array.isArray(template.headers)[m
[32m+[m[32m    ? template.headers.map((h) => ({ ...h, id: h.id || generateRowId('hdr') }))[m
[32m+[m[32m    : [];[m
[32m+[m
[32m+[m[32m  activeRequest.body = template.body[m
[32m+[m[32m    ? { type: template.body.type || 'none', text: template.body.text || '' }[m
[32m+[m[32m    : { type: 'none', text: '' };[m
[32m+[m
[32m+[m[32m  activeRequest.auth = template.auth[m
[32m+[m[32m    ? {[m
[32m+[m[32m        type: template.auth.type || 'none',[m
[32m+[m[32m        bearerToken: template.auth.bearerToken || '',[m
[32m+[m[32m        basicUsername: template.auth.basicUsername || '',[m
[32m+[m[32m        basicPassword: template.auth.basicPassword || ''[m
[32m+[m[32m      }[m
[32m+[m[32m    : { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };[m
 [m
[31m-      // Update panels[m
[31m-      const panels = document.querySelectorAll('.config-panel');[m
[31m-      panels.forEach((p) => p.classList.remove('active'));[m
[32m+[m[32m  // Render state to DOM[m
[32m+[m[32m  renderActiveRequestToUI();[m
[32m+[m[32m}[m
 [m
[31m-      const activePanel = document.getElementById(`panel-${targetTab}`);[m
[31m-      if (activePanel) {[m
[31m-        activePanel.classList.add('active');[m
[31m-      }[m
[31m-    });[m
[31m-  });[m
[32m+[m[32m/**[m
[32m+[m[32m * Renders all controls from the centralized activeRequest state.[m
[32m+[m[32m */[m
[32m+[m[32mfunction renderActiveRequestToUI() {[m
[32m+[m[32m  if (typeof document === 'undefined') return;[m
[32m+[m[32m  // 1. Method selector & Badge[m
[32m+[m[32m  const methodSelect = document.getElementById('http-method-select');[m
[32m+[m[32m  const tabMethodLabel = document.getElementById('tab-method-label');[m
[32m+[m[32m  if (methodSelect) {[m
[32m+[m[32m    methodSelect.value = activeRequest.method;[m
[32m+[m[32m    methodSelect.className = `http-method-select method-color-${activeRequest.method.toLowerCase()}`;[m
[32m+[m[32m  }[m
[32m+[m[32m  if (tabMethodLabel) {[m
[32m+[m[32m    tabMethodLabel.textContent = activeRequest.method;[m
[32m+[m[32m    tabMethodLabel.className = `tab-method-badge method-${activeRequest.method.toLowerCase()}`;[m
[32m+[m[32m  }[m
 [m
[31m-  // Response Inspector Tabs (Body, Headers, Cookies)[m
[31m-  const responseTabs = document.querySelectorAll('.response-tab');[m
[31m-  responseTabs.forEach((tab) => {[m
[31m-    tab.addEventListener('click', () => {[m
[31m-      const targetTab = tab.getAttribute('data-tab');[m
[32m+[m[32m  // 2. Request URL[m
[32m+[m[32m  const urlInput = document.getElementById('request-url-input');[m
[32m+[m[32m  if (urlInput) {[m
[32m+[m[32m    urlInput.value = activeRequest.url;[m
[32m+[m[32m  }[m
 [m
[31m-      responseTabs.forEach((t) => {[m
[31m-        t.classList.remove('active');[m
[31m-        t.setAttribute('aria-selected', 'false');[m
[31m-      });[m
[31m-      tab.classList.add('active');[m
[31m-      tab.setAttribute('aria-selected', 'true');[m
[32m+[m[32m  // 3. Tab Title[m
[32m+[m[32m  const tabTitleLabel = document.getElementById('tab-title-label');[m
[32m+[m[32m  if (tabTitleLabel) {[m
[32m+[m[32m    tabTitleLabel.textContent = activeRequest.name;[m
[32m+[m[32m  }[m
 [m
[31m-      const panels = document.querySelectorAll('.response-panel');[m
[31m-      panels.forEach((p) => p.classList.remove('active'));[m
[32m+[m[32m  // 4. Render Table rows[m
[32m+[m[32m  renderParamsTable();[m
[32m+[m[32m  renderHeadersTable();[m
 [m
[31m-      const activePanel = document.getElementById(`panel-${targetTab}`);[m
[31m-      if (activePanel) {[m
[31m-        activePanel.classList.add('active');[m
[31m-      }[m
[31m-    });[m
[31m-  });[m
[31m-}[m
[32m+[m[32m  // 5. Body controls[m
[32m+[m[32m  renderBodyControls();[m
 [m
[31m-/* ==========================================================================[m
[31m-   3. Key-Value Tables (Parameters & Headers)[m
[31m-   ========================================================================== */[m
[32m+[m[32m  // 6. Auth controls[m
[32m+[m[32m  renderAuthControls();[m
 [m
[31m-function initKeyValueTables() {[m
[31m-  // Add initial parameter rows[m
[31m-  const paramsTbody = document.getElementById('params-tbody');[m
[31m-  if (paramsTbody) {[m
[31m-    createRow(paramsTbody, '', '', '', false, updateParamsCount);[m
[31m-  }[m
[32m+[m[32m  // 7. Update Live URL Preview[m
[32m+[m[32m  updateUrlPreview();[m
[32m+[m[32m}[m
 [m
[31m-  // Add initial header rows with standard default suggestions[m
[31m-  const headersTbody = document.getElementById('headers-tbody');[m
[31m-  if (headersTbody) {[m
[31m-    createRow(headersTbody, 'Accept', 'application/json', 'Expected response format', true, updateHeadersCount);[m
[31m-    createRow(headersTbody, 'User-Agent', 'DevProbe/1.0', 'Client identifier', true, updateHeadersCount);[m
[31m-    updateHeadersCount();[m
[31m-  }[m
[32m+[m[32m/**[m
[32m+[m[32m * Renders the Query Parameters table strictly from activeRequest.params state.[m
[32m+[m[32m */[m
[32m+[m[32mfunction renderParamsTable() {[m
[32m+[m[32m  const tbody = document.getElementById('params-tbody');[m
[32m+[m[32m  if (!tbody) return;[m
 [m
[31m-  // Hook Add Parameter button[m
[31m-  const btnAddParam = document.getElementById('btn-add-param');[m
[31m-  if (btnAddParam) {[m
[31m-    btnAddParam.addEventListener('click', () => {[m
[31m-      createRow(paramsTbody, '', '', '', true, updateParamsCount);[m
[32m+[m[32m  tbody.innerHTML = '';[m
[32m+[m
[32m+[m[32m  activeRequest.params.forEach((param) => {[m
[32m+[m[32m    const tr = document.createElement('tr');[m
[32m+[m
[32m+[m[32m    // Checkbox (enabled)[m
[32m+[m[32m    const tdCheck = document.createElement('td');[m
[32m+[m[32m    tdCheck.className = 'col-check';[m
[32m+[m[32m    const labelCheck = document.createElement('label');[m
[32m+[m[32m    labelCheck.className = 'cell-checkbox';[m
[32m+[m[32m    const checkbox = document.createElement('input');[m
[32m+[m[32m    checkbox.type = 'checkbox';[m
[32m+[m[32m    checkbox.checked = !!param.enabled;[m
[32m+[m[32m    checkbox.setAttribute('aria-label', 'Toggle parameter enabled');[m
[32m+[m[32m    checkbox.addEventListener('change', () => {[m
[32m+[m[32m      param.enabled = checkbox.checked;[m
       updateParamsCount();[m
[32m+[m[32m      updateUrlPreview();[m
     });[m
[31m-  }[m
[31m-[m
[31m-  // Hook Add Header button[m
[31m-  const btnAddHeader = document.getElementById('btn-add-header');[m
[31m-  if (btnAddHeader) {[m
[31m-    btnAddHeader.addEventListener('click', () => {[m
[31m-      createRow(headersTbody, '', '', '', true, updateHeadersCount);[m
[31m-      updateHeadersCount();[m
[32m+[m[32m    labelCheck.appendChild(checkbox);[m
[32m+[m[32m    tdCheck.appendChild(labelCheck);[m
[32m+[m
[32m+[m[32m    // Key input[m
[32m+[m[32m    const tdKey = document.createElement('td');[m
[32m+[m[32m    tdKey.className = 'col-key';[m
[32m+[m[32m    const inputKey = document.createElement('input');[m
[32m+[m[32m    inputKey.type = 'text';[m
[32m+[m[32m    inputKey.className = 'table-input font-mono';[m
[32m+[m[32m    inputKey.placeholder = 'Parameter Key';[m
[32m+[m[32m    inputKey.value = param.key || '';[m
[32m+[m[32m    inputKey.addEventListener('input', () => {[m
[32m+[m[32m      param.key = inputKey.value;[m
[32m+[m[32m      updateParamsCount();[m
[32m+[m[32m      updateUrlPreview();[m
     });[m
[31m-  }[m
[32m+[m[32m    tdKey.appendChild(inputKey);[m
[32m+[m
[32m+[m[32m    // Value input[m
[32m+[m[32m    const tdVal = document.createElement('td');[m
[32m+[m[32m    tdVal.className = 'col-val';[m
[32m+[m[32m    const inputVal = document.createElement('input');[m
[32m+[m[32m    inputVal.type = 'text';[m
[32m+[m[32m    inputVal.className = 'table-input font-mono';[m
[32m+[m[32m    inputVal.placeholder = 'Value';[m
[32m+[m[32m    inputVal.value = param.value !== undefined ? String(param.value) : '';[m
[32m+[m[32m    inputVal.addEventListener('input', () => {[m
[32m+[m[32m      param.value = inputVal.value;[m
[32m+[m[32m      updateUrlPreview();[m
[32m+[m[32m    });[m
[32m+[m[32m    tdVal.appendChild(inputVal);[m
[32m+[m
[32m+[m[32m    // Description input[m
[32m+[m[32m    const tdDesc = document.createElement('td');[m
[32m+[m[32m    tdDesc.className = 'col-desc';[m
[32m+[m[32m    const inputDesc = document.createElement('input');[m
[32m+[m[32m    inputDesc.type = 'text';[m
[32m+[m[32m    inputDesc.className = 'table-input';[m
[32m+[m[32m    inputDesc.placeholder = 'Description (optional)';[m
[32m+[m[32m    inputDesc.value = param.description || '';[m
[32m+[m[32m    inputDesc.addEventListener('input', () => {[m
[32m+[m[32m      param.description = inputDesc.value;[m
[32m+[m[32m    });[m
[32m+[m[32m    tdDesc.appendChild(inputDesc);[m
[32m+[m
[32m+[m[32m    // Delete button[m
[32m+[m[32m    const tdAction = document.createElement('td');[m
[32m+[m[32m    tdAction.className = 'col-action';[m
[32m+[m[32m    const deleteBtn = document.createElement('button');[m
[32m+[m[32m    deleteBtn.className = 'btn-remove-row';[m
[32m+[m[32m    deleteBtn.title = 'Remove parameter';[m
[32m+[m[32m    deleteBtn.setAttribute('aria-label', 'Remove parameter');[m
[32m+[m[32m    deleteBtn.innerHTML = `[m
[32m+[m[32m      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[32m+[m[32m        <line x1="18" y1="6" x2="6" y2="18"></line>[m
[32m+[m[32m        <line x1="6" y1="6" x2="18" y2="18"></line>[m
[32m+[m[32m      </svg>`;[m
[32m+[m[32m    deleteBtn.addEventListener('click', () => {[m
[32m+[m[32m      const idx = activeRequest.params.indexOf(param);[m
[32m+[m[32m      if (idx !== -1) {[m
[32m+[m[32m        activeRequest.params.splice(idx, 1);[m
[32m+[m[32m      }[m
[32m+[m[32m      renderParamsTable();[m
[32m+[m[32m      updateUrlPreview();[m
[32m+[m[32m    });[m
[32m+[m[32m    tdAction.appendChild(deleteBtn);[m
[32m+[m
[32m+[m[32m    tr.appendChild(tdCheck);[m
[32m+[m[32m    tr.appendChild(tdKey);[m
[32m+[m[32m    tr.appendChild(tdVal);[m
[32m+[m[32m    tr.appendChild(tdDesc);[m
[32m+[m[32m    tr.appendChild(tdAction);[m
[32m+[m
[32m+[m[32m    tbody.appendChild(tr);[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32m  updateParamsCount();[m
 }[m
 [m
 /**[m
[31m- * Creates a generic key-value row inside a tbody[m
[32m+[m[32m * Renders the HTTP Headers table strictly from activeRequest.headers state.[m
  */[m
[31m-function createRow(tbody, key = '', value = '', desc = '', enabled = true, countCallback = null) {[m
[32m+[m[32mfunction renderHeadersTable() {[m
[32m+[m[32m  const tbody = document.getElementById('headers-tbody');[m
   if (!tbody) return;[m
 [m
[31m-  const tr = document.createElement('tr');[m
[31m-[m
[31m-  // Checkbox column[m
[31m-  const tdCheck = document.createElement('td');[m
[31m-  tdCheck.className = 'col-check';[m
[31m-  const labelCheck = document.createElement('label');[m
[31m-  labelCheck.className = 'cell-checkbox';[m
[31m-  const checkbox = document.createElement('input');[m
[31m-  checkbox.type = 'checkbox';[m
[31m-  checkbox.checked = enabled;[m
[31m-  checkbox.setAttribute('aria-label', 'Toggle row active state');[m
[31m-  checkbox.addEventListener('change', () => {[m
[31m-    if (countCallback) countCallback();[m
[31m-  });[m
[31m-  labelCheck.appendChild(checkbox);[m
[31m-  tdCheck.appendChild(labelCheck);[m
[31m-[m
[31m-  // Key column[m
[31m-  const tdKey = document.createElement('td');[m
[31m-  tdKey.className = 'col-key';[m
[31m-  const inputKey = document.createElement('input');[m
[31m-  inputKey.type = 'text';[m
[31m-  inputKey.className = 'table-input font-mono';[m
[31m-  inputKey.placeholder = 'Key';[m
[31m-  inputKey.value = key;[m
[31m-  inputKey.addEventListener('input', () => {[m
[31m-    if (countCallback) countCallback();[m
[31m-  });[m
[31m-  tdKey.appendChild(inputKey);[m
[31m-[m
[31m-  // Value column[m
[31m-  const tdVal = document.createElement('td');[m
[31m-  tdVal.className = 'col-val';[m
[31m-  const inputVal = document.createElement('input');[m
[31m-  inputVal.type = 'text';[m
[31m-  inputVal.className = 'table-input font-mono';[m
[31m-  inputVal.placeholder = 'Value';[m
[31m-  inputVal.value = value;[m
[31m-  tdVal.appendChild(inputVal);[m
[31m-[m
[31m-  // Description column[m
[31m-  const tdDesc = document.createElement('td');[m
[31m-  tdDesc.className = 'col-desc';[m
[31m-  const inputDesc = document.createElement('input');[m
[31m-  inputDesc.type = 'text';[m
[31m-  inputDesc.className = 'table-input';[m
[31m-  inputDesc.placeholder = 'Description (optional)';[m
[31m-  inputDesc.value = desc;[m
[31m-  tdDesc.appendChild(inputDesc);[m
[31m-[m
[31m-  // Action column (Delete row)[m
[31m-  const tdAction = document.createElement('td');[m
[31m-  tdAction.className = 'col-action';[m
[31m-  const deleteBtn = document.createElement('button');[m
[31m-  deleteBtn.className = 'btn-remove-row';[m
[31m-  deleteBtn.title = 'Remove row';[m
[31m-  deleteBtn.setAttribute('aria-label', 'Remove row');[m
[31m-  deleteBtn.innerHTML = `[m
[31m-    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[31m-      <line x1="18" y1="6" x2="6" y2="18"></line>[m
[31m-      <line x1="6" y1="6" x2="18" y2="18"></line>[m
[31m-    </svg>`;[m
[31m-  deleteBtn.addEventListener('click', () => {[m
[31m-    tr.remove();[m
[31m-    if (countCallback) countCallback();[m
[31m-  });[m
[31m-  tdAction.appendChild(deleteBtn);[m
[32m+[m[32m  tbody.innerHTML = '';[m
[32m+[m
[32m+[m[32m  activeRequest.headers.forEach((header) => {[m
[32m+[m[32m    const tr = document.createElement('tr');[m
[32m+[m
[32m+[m[32m    // Checkbox (enabled)[m
[32m+[m[32m    const tdCheck = document.createElement('td');[m
[32m+[m[32m    tdCheck.className = 'col-check';[m
[32m+[m[32m    const labelCheck = document.createElement('label');[m
[32m+[m[32m    labelCheck.className = 'cell-checkbox';[m
[32m+[m[32m    const checkbox = document.createElement('input');[m
[32m+[m[32m    checkbox.type = 'checkbox';[m
[32m+[m[32m    checkbox.checked = !!header.enabled;[m
[32m+[m[32m    checkbox.setAttribute('aria-label', 'Toggle header enabled');[m
[32m+[m[32m    checkbox.addEventListener('change', () => {[m
[32m+[m[32m      header.enabled = checkbox.checked;[m
[32m+[m[32m      updateHeadersCount();[m
[32m+[m[32m      validateHeaders(activeRequest.headers, false);[m
[32m+[m[32m    });[m
[32m+[m[32m    labelCheck.appendChild(checkbox);[m
[32m+[m[32m    tdCheck.appendChild(labelCheck);[m
[32m+[m
[32m+[m[32m    // Key input[m
[32m+[m[32m    const tdKey = document.createElement('td');[m
[32m+[m[32m    tdKey.className = 'col-key';[m
[32m+[m[32m    const inputKey = document.createElement('input');[m
[32m+[m[32m    inputKey.type = 'text';[m
[32m+[m[32m    inputKey.className = 'table-input font-mono';[m
[32m+[m[32m    inputKey.placeholder = 'Header Key (e.g. Accept)';[m
[32m+[m[32m    inputKey.value = header.key || '';[m
[32m+[m[32m    inputKey.addEventListener('input', () => {[m
[32m+[m[32m      header.key = inputKey.value;[m
[32m+[m[32m      updateHeadersCount();[m
[32m+[m[32m      validateHeaders(activeRequest.headers, false);[m
[32m+[m[32m    });[m
[32m+[m[32m    tdKey.appendChild(inputKey);[m
[32m+[m
[32m+[m[32m    // Value input[m
[32m+[m[32m    const tdVal = document.createElement('td');[m
[32m+[m[32m    tdVal.className = 'col-val';[m
[32m+[m[32m    const inputVal = document.createElement('input');[m
[32m+[m[32m    inputVal.type = 'text';[m
[32m+[m[32m    inputVal.className = 'table-input font-mono';[m
[32m+[m[32m    inputVal.placeholder = 'Value (e.g. application/json)';[m
[32m+[m[32m    inputVal.value = header.value !== undefined ? String(header.value) : '';[m
[32m+[m[32m    inputVal.addEventListener('input', () => {[m
[32m+[m[32m      header.value = inputVal.value;[m
[32m+[m[32m    });[m
[32m+[m[32m    tdVal.appendChild(inputVal);[m
[32m+[m
[32m+[m[32m    // Description input[m
[32m+[m[32m    const tdDesc = document.createElement('td');[m
[32m+[m[32m    tdDesc.className = 'col-desc';[m
[32m+[m[32m    const inputDesc = document.createElement('input');[m
[32m+[m[32m    inputDesc.type = 'text';[m
[32m+[m[32m    inputDesc.className = 'table-input';[m
[32m+[m[32m    inputDesc.placeholder = 'Description (optional)';[m
[32m+[m[32m    inputDesc.value = header.description || '';[m
[32m+[m[32m    inputDesc.addEventListener('input', () => {[m
[32m+[m[32m      header.description = inputDesc.value;[m
[32m+[m[32m    });[m
[32m+[m[32m    tdDesc.appendChild(inputDesc);[m
[32m+[m
[32m+[m[32m    // Delete button[m
[32m+[m[32m    const tdAction = document.createElement('td');[m
[32m+[m[32m    tdAction.className = 'col-action';[m
[32m+[m[32m    const deleteBtn = document.createElement('button');[m
[32m+[m[32m    deleteBtn.className = 'btn-remove-row';[m
[32m+[m[32m    deleteBtn.title = 'Remove header';[m
[32m+[m[32m    deleteBtn.setAttribute('aria-label', 'Remove header');[m
[32m+[m[32m    deleteBtn.innerHTML = `[m
[32m+[m[32m      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">[m
[32m+[m[32m        <line x1="18" y1="6" x2="6" y2="18"></line>[m
[32m+[m[32m        <line x1="6" y1="6" x2="18" y2="18"></line>[m
[32m+[m[32m      </svg>`;[m
[32m+[m[32m    deleteBtn.addEventListener('click', () => {[m
[32m+[m[32m      const idx = activeRequest.headers.indexOf(header);[m
[32m+[m[32m      if (idx !== -1) {[m
[32m+[m[32m        activeRequest.headers.splice(idx, 1);[m
[32m+[m[32m      }[m
[32m+[m[32m      renderHeadersTable();[m
[32m+[m[32m      validateHeaders(activeRequest.headers, false);[m
[32m+[m[32m    });[m
[32m+[m[32m    tdAction.appendChild(deleteBtn);[m
 [m
[31m-  // Assemble row[m
[31m-  tr.appendChild(tdCheck);[m
[31m-  tr.appendChild(tdKey);[m
[31m-  tr.appendChild(tdVal);[m
[31m-  tr.appendChild(tdDesc);[m
[31m-  tr.appendChild(tdAction);[m
[32m+[m[32m    tr.appendChild(tdCheck);[m
[32m+[m[32m    tr.appendChild(tdKey);[m
[32m+[m[32m    tr.appendChild(tdVal);[m
[32m+[m[32m    tr.appendChild(tdDesc);[m
[32m+[m[32m    tr.appendChild(tdAction);[m
 [m
[31m-  tbody.appendChild(tr);[m
[32m+[m[32m    tbody.appendChild(tr);[m
[32m+[m[32m  });[m
 [m
[31m-  if (countCallback) countCallback();[m
[32m+[m[32m  updateHeadersCount();[m
[32m+[m[32m  validateHeaders(activeRequest.headers, false);[m
 }[m
 [m
[32m+[m[32m/**[m
[32m+[m[32m * Updates the badge counter for enabled parameters that have a non-empty key.[m
[32m+[m[32m */[m
 function updateParamsCount() {[m
[31m-  const tbody = document.getElementById('params-tbody');[m
   const countBadge = document.getElementById('params-count');[m
[31m-  if (!tbody || !countBadge) return;[m
[31m-[m
[31m-  const rows = tbody.querySelectorAll('tr');[m
[31m-  let activeCount = 0;[m
[31m-  rows.forEach((row) => {[m
[31m-    const check = row.querySelector('input[type="checkbox"]');[m
[31m-    const keyInput = row.querySelector('.col-key input');[m
[31m-    if (check && check.checked && keyInput && keyInput.value.trim().length > 0) {[m
[31m-      activeCount++;[m
[31m-    }[m
[31m-  });[m
[31m-  countBadge.textContent = activeCount.toString();[m
[32m+[m[32m  if (!countBadge) return;[m
[32m+[m
[32m+[m[32m  const count = activeRequest.params.filter([m
[32m+[m[32m    (p) => p.enabled && typeof p.key === 'string' && p.key.trim().length > 0[m
[32m+[m[32m  ).length;[m
[32m+[m
[32m+[m[32m  countBadge.textContent = count.toString();[m
 }[m
 [m
[32m+[m[32m/**[m
[32m+[m[32m * Updates the badge counter for enabled headers that have a non-empty key.[m
[32m+[m[32m */[m
 function updateHeadersCount() {[m
[31m-  const tbody = document.getElementById('headers-tbody');[m
   const countBadge = document.getElementById('headers-count');[m
[31m-  if (!tbody || !countBadge) return;[m
[31m-[m
[31m-  const rows = tbody.querySelectorAll('tr');[m
[31m-  let activeCount = 0;[m
[31m-  rows.forEach((row) => {[m
[31m-    const check = row.querySelector('input[type="checkbox"]');[m
[31m-    const keyInput = row.querySelector('.col-key input');[m
[31m-    if (check && check.checked && keyInput && keyInput.value.trim().length > 0) {[m
[31m-      activeCount++;[m
[31m-    }[m
[31m-  });[m
[31m-  countBadge.textContent = activeCount.toString();[m
[31m-}[m
[32m+[m[32m  if (!countBadge) return;[m
 [m
[31m-/* ==========================================================================[m
[31m-   4. Request Body Controls[m
[31m-   ========================================================================== */[m
[32m+[m[32m  const count = activeRequest.headers.filter([m
[32m+[m[32m    (h) => h.enabled && typeof h.key === 'string' && h.key.trim().length > 0[m
[32m+[m[32m  ).length;[m
 [m
[31m-function initBodyTypeSelector() {[m
[32m+[m[32m  countBadge.textContent = count.toString();[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Renders body controls from activeRequest.body state.[m
[32m+[m[32m */[m
[32m+[m[32mfunction renderBodyControls() {[m
   const bodyRadios = document.querySelectorAll('input[name="body-type"]');[m
   const bodyNoneMsg = document.getElementById('body-none-msg');[m
   const bodyInputWrapper = document.getElementById('body-input-wrapper');[m
[36m@@ -318,112 +964,323 @@[m [mfunction initBodyTypeSelector() {[m
   const editorFormatLabel = document.getElementById('editor-format-label');[m
   const bodyTextarea = document.getElementById('body-textarea');[m
   const btnFormatJson = document.getElementById('btn-format-json');[m
[32m+[m[32m  const btnValidateJson = document.getElementById('btn-validate-json');[m
 [m
[31m-  bodyRadios.forEach((radio) => {[m
[31m-    radio.addEventListener('change', () => {[m
[31m-      const selected = radio.value;[m
[32m+[m[32m  const selected = activeRequest.body.type || 'none';[m
 [m
[31m-      if (selected === 'none') {[m
[31m-        bodyNoneMsg.classList.remove('hidden');[m
[31m-        bodyInputWrapper.classList.add('hidden');[m
[31m-        bodyActiveDot.classList.add('hidden');[m
[31m-      } else {[m
[31m-        bodyNoneMsg.classList.add('hidden');[m
[31m-        bodyInputWrapper.classList.remove('hidden');[m
[31m-        bodyActiveDot.classList.remove('hidden');[m
[31m-[m
[31m-        if (selected === 'json') {[m
[31m-          editorFormatLabel.textContent = 'JSON Editor (application/json)';[m
[31m-          btnFormatJson.classList.remove('hidden');[m
[31m-          if (!bodyTextarea.value.trim()) {[m
[31m-            bodyTextarea.value = '{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}';[m
[31m-          }[m
[31m-        } else {[m
[31m-          editorFormatLabel.textContent = 'Raw Text (text/plain)';[m
[31m-          btnFormatJson.classList.add('hidden');[m
[31m-        }[m
[31m-      }[m
[31m-    });[m
[32m+[m[32m  // Set radio state[m
[32m+[m[32m  bodyRadios.forEach((radio) => {[m
[32m+[m[32m    radio.checked = radio.value === selected;[m
   });[m
 [m
[31m-  // Beautify JSON button[m
[31m-  if (btnFormatJson && bodyTextarea) {[m
[31m-    btnFormatJson.addEventListener('click', () => {[m
[31m-      try {[m
[31m-        const parsed = JSON.parse(bodyTextarea.value);[m
[31m-        bodyTextarea.value = JSON.stringify(parsed, null, 2);[m
[31m-        showToast('JSON Formatted', 'Formatted body payload successfully.', 'info');[m
[31m-      } catch (err) {[m
[31m-        showToast('JSON Error', 'Payload is not valid JSON. Please check syntax.', 'warning');[m
[31m-      }[m
[31m-    });[m
[32m+[m[32m  if (bodyTextarea) {[m
[32m+[m[32m    bodyTextarea.value = activeRequest.body.text || '';[m
   }[m
[31m-}[m
 [m
[31m-/* ==========================================================================[m
[31m-   5. Authentication Controls[m
[31m-   ========================================================================== */[m
[32m+[m[32m  if (selected === 'none') {[m
[32m+[m[32m    if (bodyNoneMsg) bodyNoneMsg.classList.remove('hidden');[m
[32m+[m[32m    if (bodyInputWrapper) bodyInputWrapper.classList.add('hidden');[m
[32m+[m[32m    if (bodyActiveDot) bodyActiveDot.classList.add('hidden');[m
[32m+[m[32m  } else {[m
[32m+[m[32m    if (bodyNoneMsg) bodyNoneMsg.classList.add('hidden');[m
[32m+[m[32m    if (bodyInputWrapper) bodyInputWrapper.classList.remove('hidden');[m
[32m+[m[32m    if (bodyActiveDot) bodyActiveDot.classList.remove('hidden');[m
[32m+[m
[32m+[m[32m    if (selected === 'json') {[m
[32m+[m[32m      if (editorFormatLabel) editorFormatLabel.textContent = 'JSON Editor (application/json)';[m
[32m+[m[32m      if (btnFormatJson) btnFormatJson.classList.remove('hidden');[m
[32m+[m[32m      if (btnValidateJson) btnValidateJson.classList.remove('hidden');[m
[32m+[m[32m    } else {[m
[32m+[m[32m      if (editorFormatLabel) editorFormatLabel.textContent = 'Raw Text (text/plain)';[m
[32m+[m[32m      if (btnFormatJson) btnFormatJson.classList.add('hidden');[m
[32m+[m[32m      if (btnValidateJson) btnValidateJson.classList.add('hidden');[m
[32m+[m[32m    }[m
[32m+[m[32m  }[m
 [m
[31m-function initAuthTypeSelector() {[m
[32m+[m[32m  // Validate or clear JSON status[m
[32m+[m[32m  validateJsonBody(activeRequest.body.text, selected, false);[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Renders auth controls from activeRequest.auth state without clearing inputs.[m
[32m+[m[32m */[m
[32m+[m[32mfunction renderAuthControls() {[m
   const authSelect = document.getElementById('auth-type-select');[m
   const subNone = document.getElementById('auth-subpanel-none');[m
   const subBearer = document.getElementById('auth-subpanel-bearer');[m
   const subBasic = document.getElementById('auth-subpanel-basic');[m
   const authSublabel = document.getElementById('auth-sublabel');[m
[32m+[m[32m  const bearerInput = document.getElementById('auth-bearer-token');[m
[32m+[m[32m  const basicUserInput = document.getElementById('auth-basic-username');[m
[32m+[m[32m  const basicPassInput = document.getElementById('auth-basic-password');[m
[32m+[m
[32m+[m[32m  const val = activeRequest.auth.type || 'none';[m
[32m+[m
[32m+[m[32m  if (authSelect) authSelect.value = val;[m
[32m+[m
[32m+[m[32m  if (subNone) subNone.classList.add('hidden');[m
[32m+[m[32m  if (subBearer) subBearer.classList.add('hidden');[m
[32m+[m[32m  if (subBasic) subBasic.classList.add('hidden');[m
[32m+[m
[32m+[m[32m  if (val === 'bearer') {[m
[32m+[m[32m    if (subBearer) subBearer.classList.remove('hidden');[m
[32m+[m[32m    if (authSublabel) authSublabel.textContent = 'Bearer';[m
[32m+[m[32m  } else if (val === 'basic') {[m
[32m+[m[32m    if (subBasic) subBasic.classList.remove('hidden');[m
[32m+[m[32m    if (authSublabel) authSublabel.textContent = 'Basic';[m
[32m+[m[32m  } else {[m
[32m+[m[32m    if (subNone) subNone.classList.remove('hidden');[m
[32m+[m[32m    if (authSublabel) authSublabel.textContent = 'None';[m
[32m+[m[32m  }[m
 [m
[31m-  if (!authSelect) return;[m
[32m+[m[32m  // Populate inputs from state without clearing them[m
[32m+[m[32m  if (bearerInput) bearerInput.value = activeRequest.auth.bearerToken || '';[m
[32m+[m[32m  if (basicUserInput) basicUserInput.value = activeRequest.auth.basicUsername || '';[m
[32m+[m[32m  if (basicPassInput) basicPassInput.value = activeRequest.auth.basicPassword || '';[m
[32m+[m[32m}[m
 [m
[31m-  authSelect.addEventListener('change', () => {[m
[31m-    const val = authSelect.value;[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   8. Component Initializers and Event Wiring[m
[32m+[m[32m   ========================================================================== */[m
 [m
[31m-    // Hide all subpanels[m
[31m-    subNone.classList.add('hidden');[m
[31m-    subBearer.classList.add('hidden');[m
[31m-    subBasic.classList.add('hidden');[m
[32m+[m[32mif (typeof document !== 'undefined') {[m
[32m+[m[32m  document.addEventListener('DOMContentLoaded', () => {[m
[32m+[m[32m  // 1. Navigation and inspector tabs[m
[32m+[m[32m  initTabs();[m
 [m
[31m-    if (val === 'bearer') {[m
[31m-      subBearer.classList.remove('hidden');[m
[31m-      authSublabel.textContent = 'Bearer';[m
[31m-    } else if (val === 'basic') {[m
[31m-      subBasic.classList.remove('hidden');[m
[31m-      authSublabel.textContent = 'Basic';[m
[31m-    } else {[m
[31m-      subNone.classList.remove('hidden');[m
[31m-      authSublabel.textContent = 'None';[m
[31m-    }[m
[32m+[m[32m  // 2. Request URL bar & Method selector[m
[32m+[m[32m  initRequestBar();[m
[32m+[m
[32m+[m[32m  // 3. Key-Value table controls (Add Parameter, Add Header, Validate Headers)[m
[32m+[m[32m  initTableActionButtons();[m
[32m+[m
[32m+[m[32m  // 4. Body panel controls (radio modes, JSON formatting and validation)[m
[32m+[m[32m  initBodyTypeSelector();[m
[32m+[m
[32m+[m[32m  // 5. Auth panel controls (No Auth, Bearer, Basic)[m
[32m+[m[32m  initAuthTypeSelector();[m
[32m+[m
[32m+[m[32m  // 6. Sidebar (search filter, folder collapse, sample requests, sidebar toggle)[m
[32m+[m[32m  initSidebar();[m
[32m+[m
[32m+[m[32m  // 7. General action buttons (Send, Save, New Tab, Environments, Settings)[m
[32m+[m[32m  initActionButtons();[m
[32m+[m
[32m+[m[32m  // 8. Response viewer toolbar (copy, pretty/raw)[m
[32m+[m[32m  initResponseViewer();[m
[32m+[m
[32m+[m[32m  // 9. Initial state render[m
[32m+[m[32m  renderActiveRequestToUI();[m
   });[m
 }[m
 [m
[31m-/* ==========================================================================[m
[31m-   6. HTTP Method Selector and Synchronizer[m
[31m-   ========================================================================== */[m
[31m-[m
[31m-function initMethodSelector() {[m
[32m+[m[32m/**[m
[32m+[m[32m * Request Bar and URL Input synchronization[m
[32m+[m[32m */[m
[32m+[m[32mfunction initRequestBar() {[m
   const methodSelect = document.getElementById('http-method-select');[m
[32m+[m[32m  const urlInput = document.getElementById('request-url-input');[m
   const tabMethodLabel = document.getElementById('tab-method-label');[m
[32m+[m[32m  const btnCopyPreviewUrl = document.getElementById('btn-copy-preview-url');[m
 [m
[31m-  if (!methodSelect) return;[m
[32m+[m[32m  if (methodSelect) {[m
[32m+[m[32m    methodSelect.addEventListener('change', () => {[m
[32m+[m[32m      activeRequest.method = methodSelect.value;[m
[32m+[m[32m      methodSelect.className = `http-method-select method-color-${activeRequest.method.toLowerCase()}`;[m
[32m+[m[32m      if (tabMethodLabel) {[m
[32m+[m[32m        tabMethodLabel.textContent = activeRequest.method;[m
[32m+[m[32m        tabMethodLabel.className = `tab-method-badge method-${activeRequest.method.toLowerCase()}`;[m
[32m+[m[32m      }[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
 [m
[31m-  const updateMethodStyle = (method) => {[m
[31m-    // Reset all method classes on select[m
[31m-    methodSelect.className = `http-method-select method-color-${method.toLowerCase()}`;[m
[32m+[m[32m  if (urlInput) {[m
[32m+[m[32m    urlInput.addEventListener('input', () => {[m
[32m+[m[32m      activeRequest.url = urlInput.value;[m
[32m+[m[32m      updateUrlPreview();[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
 [m
[31m-    // Update tab badge[m
[31m-    if (tabMethodLabel) {[m
[31m-      tabMethodLabel.textContent = method;[m
[31m-      tabMethodLabel.className = `tab-method-badge method-${method.toLowerCase()}`;[m
[31m-    }[m
[31m-  };[m
[32m+[m[32m  if (btnCopyPreviewUrl) {[m
[32m+[m[32m    btnCopyPreviewUrl.addEventListener('click', () => {[m
[32m+[m[32m      const previewText = document.getElementById('url-preview-text');[m
[32m+[m[32m      const textToCopy = previewText ? previewText.textContent : '';[m
[32m+[m[32m      if (textToCopy && textToCopy !== '(No URL provided)') {[m
[32m+[m[32m        navigator.clipboard.writeText(textToCopy)[m
[32m+[m[32m          .then(() => showToast('Copied to Clipboard', textToCopy, 'success'))[m
[32m+[m[32m          .catch(() => showToast('Copy Failed', 'Clipboard permissions denied.', 'warning'));[m
[32m+[m[32m      }[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Key-Value Table Action Buttons (Add Parameter, Add Header, Validate Headers)[m
[32m+[m[32m */[m
[32m+[m[32mfunction initTableActionButtons() {[m
[32m+[m[32m  const btnAddParam = document.getElementById('btn-add-param');[m
[32m+[m[32m  const btnAddHeader = document.getElementById('btn-add-header');[m
[32m+[m[32m  const btnValidateHeaders = document.getElementById('btn-validate-headers');[m
[32m+[m
[32m+[m[32m  if (btnAddParam) {[m
[32m+[m[32m    btnAddParam.addEventListener('click', () => {[m
[32m+[m[32m      activeRequest.params.push({[m
[32m+[m[32m        id: generateRowId('param'),[m
[32m+[m[32m        key: '',[m
[32m+[m[32m        value: '',[m
[32m+[m[32m        description: '',[m
[32m+[m[32m        enabled: true[m
[32m+[m[32m      });[m
[32m+[m[32m      renderParamsTable();[m
[32m+[m[32m      updateUrlPreview();[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (btnAddHeader) {[m
[32m+[m[32m    btnAddHeader.addEventListener('click', () => {[m
[32m+[m[32m      activeRequest.headers.push({[m
[32m+[m[32m        id: generateRowId('hdr'),[m
[32m+[m[32m        key: '',[m
[32m+[m[32m        value: '',[m
[32m+[m[32m        description: '',[m
[32m+[m[32m        enabled: true[m
[32m+[m[32m      });[m
[32m+[m[32m      renderHeadersTable();[m
[32m+[m[32m      validateHeaders(activeRequest.headers, false);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (btnValidateHeaders) {[m
[32m+[m[32m    btnValidateHeaders.addEventListener('click', () => {[m
[32m+[m[32m      validateHeaders(activeRequest.headers, true);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Body panel event listeners[m
[32m+[m[32m */[m
[32m+[m[32mfunction initBodyTypeSelector() {[m
[32m+[m[32m  const bodyRadios = document.querySelectorAll('input[name="body-type"]');[m
[32m+[m[32m  const bodyTextarea = document.getElementById('body-textarea');[m
[32m+[m[32m  const btnFormatJson = document.getElementById('btn-format-json');[m
[32m+[m[32m  const btnValidateJson = document.getElementById('btn-validate-json');[m
 [m
[31m-  methodSelect.addEventListener('change', () => {[m
[31m-    updateMethodStyle(methodSelect.value);[m
[32m+[m[32m  bodyRadios.forEach((radio) => {[m
[32m+[m[32m    radio.addEventListener('change', () => {[m
[32m+[m[32m      activeRequest.body.type = radio.value;[m
[32m+[m[32m      renderBodyControls();[m
[32m+[m[32m    });[m
   });[m
[32m+[m
[32m+[m[32m  if (bodyTextarea) {[m
[32m+[m[32m    bodyTextarea.addEventListener('input', () => {[m
[32m+[m[32m      activeRequest.body.text = bodyTextarea.value;[m
[32m+[m[32m      // Soft validation without noisy toasts while typing[m
[32m+[m[32m      validateJsonBody(activeRequest.body.text, activeRequest.body.type, false);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (btnFormatJson) {[m
[32m+[m[32m    btnFormatJson.addEventListener('click', beautifyJsonBody);[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (btnValidateJson) {[m
[32m+[m[32m    btnValidateJson.addEventListener('click', () => {[m
[32m+[m[32m      validateJsonBody(activeRequest.body.text, activeRequest.body.type, true);[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
 }[m
 [m
[31m-/* ==========================================================================[m
[31m-   7. Sidebar (Collections, Search, History, Collapse)[m
[31m-   ========================================================================== */[m
[32m+[m[32m/**[m
[32m+[m[32m * Auth panel event listeners[m
[32m+[m[32m */[m
[32m+[m[32mfunction initAuthTypeSelector() {[m
[32m+[m[32m  const authSelect = document.getElementById('auth-type-select');[m
[32m+[m[32m  const bearerInput = document.getElementById('auth-bearer-token');[m
[32m+[m[32m  const basicUserInput = document.getElementById('auth-basic-username');[m
[32m+[m[32m  const basicPassInput = document.getElementById('auth-basic-password');[m
[32m+[m
[32m+[m[32m  if (authSelect) {[m
[32m+[m[32m    authSelect.addEventListener('change', () => {[m
[32m+[m[32m      activeRequest.auth.type = authSelect.value;[m
[32m+[m[32m      renderAuthControls();[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (bearerInput) {[m
[32m+[m[32m    bearerInput.addEventListener('input', () => {[m
[32m+[m[32m      activeRequest.auth.bearerToken = bearerInput.value;[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (basicUserInput) {[m
[32m+[m[32m    basicUserInput.addEventListener('input', () => {[m
[32m+[m[32m      activeRequest.auth.basicUsername = basicUserInput.value;[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (basicPassInput) {[m
[32m+[m[32m    basicPassInput.addEventListener('input', () => {[m
[32m+[m[32m      activeRequest.auth.basicPassword = basicPassInput.value;[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Configuration & Response Inspector Tabs[m
[32m+[m[32m */[m
[32m+[m[32mfunction initTabs() {[m
[32m+[m[32m  // Request Config Tabs (Params, Headers, Body, Auth)[m
[32m+[m[32m  const configTabs = document.querySelectorAll('.config-tab');[m
[32m+[m[32m  configTabs.forEach((tab) => {[m
[32m+[m[32m    tab.addEventListener('click', () => {[m
[32m+[m[32m      const targetTab = tab.getAttribute('data-tab');[m
[32m+[m
[32m+[m[32m      configTabs.forEach((t) => {[m
[32m+[m[32m        t.classList.remove('active');[m
[32m+[m[32m        t.setAttribute('aria-selected', 'false');[m
[32m+[m[32m      });[m
[32m+[m[32m      tab.classList.add('active');[m
[32m+[m[32m      tab.setAttribute('aria-selected', 'true');[m
[32m+[m
[32m+[m[32m      const panels = document.querySelectorAll('.config-panel');[m
[32m+[m[32m      panels.forEach((p) => p.classList.remove('active'));[m
[32m+[m
[32m+[m[32m      const activePanel = document.getElementById(`panel-${targetTab}`);[m
[32m+[m[32m      if (activePanel) {[m
[32m+[m[32m        activePanel.classList.add('active');[m
[32m+[m[32m      }[m
[32m+[m[32m    });[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32m  // Response Inspector Tabs (Body, Headers, Cookies)[m
[32m+[m[32m  const responseTabs = document.querySelectorAll('.response-tab');[m
[32m+[m[32m  responseTabs.forEach((tab) => {[m
[32m+[m[32m    tab.addEventListener('click', () => {[m
[32m+[m[32m      const targetTab = tab.getAttribute('data-tab');[m
[32m+[m
[32m+[m[32m      responseTabs.forEach((t) => {[m
[32m+[m[32m        t.classList.remove('active');[m
[32m+[m[32m        t.setAttribute('aria-selected', 'false');[m
[32m+[m[32m      });[m
[32m+[m[32m      tab.classList.add('active');[m
[32m+[m[32m      tab.setAttribute('aria-selected', 'true');[m
[32m+[m
[32m+[m[32m      const panels = document.querySelectorAll('.response-panel');[m
[32m+[m[32m      panels.forEach((p) => p.classList.remove('active'));[m
[32m+[m
[32m+[m[32m      const activePanel = document.getElementById(`panel-${targetTab}`);[m
[32m+[m[32m      if (activePanel) {[m
[32m+[m[32m        activePanel.classList.add('active');[m
[32m+[m[32m      }[m
[32m+[m[32m    });[m
[32m+[m[32m  });[m
[32m+[m[32m}[m
 [m
[32m+[m[32m/**[m
[32m+[m[32m * Sidebar Navigation (Search filter, Folder collapse, Sample requests, Sidebar drawer)[m
[32m+[m[32m */[m
 function initSidebar() {[m
   // Folder Toggle (Demo Collection)[m
   const folderToggle = document.getElementById('folder-toggle-btn');[m
[36m@@ -455,9 +1312,9 @@[m [mfunction initSidebar() {[m
       const query = searchInput.value.toLowerCase().trim();[m
 [m
       if (query.length > 0) {[m
[31m-        btnClearSearch.classList.remove('hidden');[m
[32m+[m[32m        if (btnClearSearch) btnClearSearch.classList.remove('hidden');[m
       } else {[m
[31m-        btnClearSearch.classList.add('hidden');[m
[32m+[m[32m        if (btnClearSearch) btnClearSearch.classList.add('hidden');[m
       }[m
 [m
       let visibleCount = 0;[m
[36m@@ -497,64 +1354,65 @@[m [mfunction initSidebar() {[m
   // Sample Request Click Handling[m
   requestButtons.forEach((btn) => {[m
     btn.addEventListener('click', () => {[m
[31m-      // Mark as active in sidebar[m
       requestButtons.forEach((b) => b.classList.remove('active'));[m
       btn.classList.add('active');[m
 [m
[32m+[m[32m      const reqId = btn.getAttribute('data-id');[m
       const method = btn.getAttribute('data-method') || 'GET';[m
       const name = btn.getAttribute('data-name') || 'Untitled Request';[m
       const url = btn.getAttribute('data-url') || '';[m
 [m
[31m-      loadRequestIntoEditor(method, name, url);[m
[32m+[m[32m      if (reqId && SAMPLE_REQUEST_TEMPLATES[reqId]) {[m
[32m+[m[32m        loadRequestIntoState(SAMPLE_REQUEST_TEMPLATES[reqId]);[m
[32m+[m[32m      } else {[m
[32m+[m[32m        // Fallback for custom or unmapped request buttons[m
[32m+[m[32m        loadRequestIntoState({[m
[32m+[m[32m          name,[m
[32m+[m[32m          method,[m
[32m+[m[32m          url,[m
[32m+[m[32m          params: [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }],[m
[32m+[m[32m          headers: [[m
[32m+[m[32m            { id: generateRowId('hdr'), key: 'Accept', value: 'application/json', description: 'Expected format', enabled: true }[m
[32m+[m[32m          ],[m
[32m+[m[32m          body: { type: 'none', text: '' },[m
[32m+[m[32m          auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m        });[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      showToast('Request Selected', `Loaded "${name}" into the workspace.`, 'info');[m
     });[m
   });[m
 }[m
 [m
 /**[m
[31m- * Loads a specified request's parameters into the active editor[m
[32m+[m[32m * Top Navigation and Workspace Action Buttons[m
  */[m
[31m-function loadRequestIntoEditor(method, name, url) {[m
[31m-  const methodSelect = document.getElementById('http-method-select');[m
[31m-  const urlInput = document.getElementById('request-url-input');[m
[31m-  const tabTitleLabel = document.getElementById('tab-title-label');[m
[31m-  const tabMethodLabel = document.getElementById('tab-method-label');[m
[31m-[m
[31m-  if (methodSelect) {[m
[31m-    methodSelect.value = method;[m
[31m-    methodSelect.className = `http-method-select method-color-${method.toLowerCase()}`;[m
[31m-  }[m
[31m-[m
[31m-  if (urlInput) {[m
[31m-    urlInput.value = url;[m
[31m-  }[m
[31m-[m
[31m-  if (tabTitleLabel) {[m
[31m-    tabTitleLabel.textContent = name;[m
[31m-  }[m
[31m-[m
[31m-  if (tabMethodLabel) {[m
[31m-    tabMethodLabel.textContent = method;[m
[31m-    tabMethodLabel.className = `tab-method-badge method-${method.toLowerCase()}`;[m
[31m-  }[m
[31m-[m
[31m-  showToast('Request Selected', `Loaded "${name}" into the workspace.`, 'info');[m
[31m-}[m
[31m-[m
[31m-/* ==========================================================================[m
[31m-   8. Action Buttons (Send, Save, New Request, Environment, Settings)[m
[31m-   ========================================================================== */[m
[31m-[m
 function initActionButtons() {[m
   // Send Button[m
   const btnSend = document.getElementById('btn-send-request');[m
   if (btnSend) {[m
     btnSend.addEventListener('click', () => {[m
[31m-      const urlInput = document.getElementById('request-url-input');[m
[31m-      const targetUrl = urlInput ? urlInput.value.trim() : '';[m
[32m+[m[32m      const prepared = prepareRequestUrl([m
[32m+[m[32m        activeRequest.url,[m
[32m+[m[32m        activeRequest.params,[m
[32m+[m[32m        activeRequest.selectedEnvironment[m
[32m+[m[32m      );[m
[32m+[m
[32m+[m[32m      if (!prepared.isValid) {[m
[32m+[m[32m        showToast('Cannot Send Request', prepared.error || 'Please check your URL configuration.', 'warning');[m
[32m+[m[32m        return;[m
[32m+[m[32m      }[m
[32m+[m
[32m+[m[32m      // Validate headers before reporting ready[m
[32m+[m[32m      const headerVal = validateHeaders(activeRequest.headers, false);[m
[32m+[m[32m      if (!headerVal.isValid) {[m
[32m+[m[32m        showToast('Header Issues Detected', headerVal.errors[0], 'warning');[m
[32m+[m[32m        return;[m
[32m+[m[32m      }[m
 [m
       showToast([m
         'Request Execution Planned for Day 5',[m
[31m-        `API execution engine is currently under development. Requests to "${targetUrl || 'URL'}" will be executed starting in Day 5.`,[m
[32m+[m[32m        `Ready to dispatch ${activeRequest.method} request to: ${prepared.url}. API execution engine connects in Day 5.`,[m
         'info'[m
       );[m
     });[m
[36m@@ -578,18 +1436,22 @@[m [mfunction initActionButtons() {[m
   const btnCloseTab = document.getElementById('btn-close-tab');[m
 [m
   const resetToNewRequest = () => {[m
[31m-    loadRequestIntoEditor('GET', 'Untitled Request', '');[m
[32m+[m[32m    loadRequestIntoState({[m
[32m+[m[32m      name: 'Untitled Request',[m
[32m+[m[32m      method: 'GET',[m
[32m+[m[32m      url: '',[m
[32m+[m[32m      params: [{ id: generateRowId('param'), key: '', value: '', description: '', enabled: false }],[m
[32m+[m[32m      headers: [[m
[32m+[m[32m        { id: generateRowId('hdr'), key: 'Accept', value: 'application/json', description: 'Expected response format', enabled: true }[m
[32m+[m[32m      ],[m
[32m+[m[32m      body: { type: 'none', text: '' },[m
[32m+[m[32m      auth: { type: 'none', bearerToken: '', basicUsername: '', basicPassword: '' }[m
[32m+[m[32m    });[m
     showToast('New Request Tab', 'Reset workspace editor for a new request.', 'info');[m
   };[m
 [m
[31m-  if (btnSidebarNew) {[m
[31m-    btnSidebarNew.addEventListener('click', resetToNewRequest);[m
[31m-  }[m
[31m-[m
[31m-  if (btnNewTab) {[m
[31m-    btnNewTab.addEventListener('click', resetToNewRequest);[m
[31m-  }[m
[31m-[m
[32m+[m[32m  if (btnSidebarNew) btnSidebarNew.addEventListener('click', resetToNewRequest);[m
[32m+[m[32m  if (btnNewTab) btnNewTab.addEventListener('click', resetToNewRequest);[m
   if (btnCloseTab) {[m
     btnCloseTab.addEventListener('click', (e) => {[m
       e.stopPropagation();[m
[36m@@ -601,11 +1463,7 @@[m [mfunction initActionButtons() {[m
   const btnNewCollection = document.getElementById('btn-new-collection');[m
   if (btnNewCollection) {[m
     btnNewCollection.addEventListener('click', () => {[m
[31m-      showToast([m
[31m-        'Collections Management',[m
[31m-        'Creating custom collections will be enabled alongside persistent storage in Day 9.',[m
[31m-        'info'[m
[31m-      );[m
[32m+[m[32m      showToast('Collections Management', 'Creating custom collections will be enabled alongside persistent storage in Day 9.', 'info');[m
     });[m
   }[m
 [m
[36m@@ -613,8 +1471,13 @@[m [mfunction initActionButtons() {[m
   const envSelector = document.getElementById('env-selector');[m
   if (envSelector) {[m
     envSelector.addEventListener('change', () => {[m
[31m-      const selectedText = envSelector.options[envSelector.selectedIndex].text;[m
[31m-      showToast('Environment Changed', `Switched active environment to: ${selectedText}. Variable substitution planned for Day 13.`, 'info');[m
[32m+[m[32m      const selectedKey = envSelector.value;[m
[32m+[m[32m      activeRequest.selectedEnvironment = selectedKey;[m
[32m+[m[32m      const envObj = ENVIRONMENTS[selectedKey];[m
[32m+[m[32m      const envName = envObj ? envObj.name : 'Unknown';[m
[32m+[m
[32m+[m[32m      updateUrlPreview();[m
[32m+[m[32m      showToast('Environment Changed', `Switched active environment to: ${envName}. Variables like {{base_url}} will resolve accordingly.`, 'info');[m
     });[m
   }[m
 [m
[36m@@ -643,10 +1506,9 @@[m [mfunction initActionButtons() {[m
   }[m
 }[m
 [m
[31m-/* ==========================================================================[m
[31m-   9. Response Viewer Toolbar[m
[31m-   ========================================================================== */[m
[31m-[m
[32m+[m[32m/**[m
[32m+[m[32m * Response Viewer Toolbar[m
[32m+[m[32m */[m
 function initResponseViewer() {[m
   const btnCopy = document.getElementById('btn-copy-response');[m
   const formatButtons = document.querySelectorAll('.format-btn');[m
[36m@@ -664,3 +1526,39 @@[m [mfunction initResponseViewer() {[m
     });[m
   });[m
 }[m
[32m+[m
[32m+[m[32m/* ==========================================================================[m
[32m+[m[32m   9. Testing and Module Compatibility Export[m
[32m+[m[32m   ========================================================================== */[m
[32m+[m
[32m+[m[32m// Expose state and reusable helpers on window object for testing and inspection[m
[32m+[m[32mif (typeof window !== 'undefined') {[m
[32m+[m[32m  window.DevProbe = {[m
[32m+[m[32m    activeRequest,[m
[32m+[m[32m    ENVIRONMENTS,[m
[32m+[m[32m    getEnvironmentVariable,[m
[32m+[m[32m    resolveVariables,[m
[32m+[m[32m    prepareRequestUrl,[m
[32m+[m[32m    validateHeaders,[m
[32m+[m[32m    validateJsonBody,[m
[32m+[m[32m    beautifyJsonBody,[m
[32m+[m[32m    loadRequestIntoState,[m
[32m+[m[32m    updateUrlPreview,[m
[32m+[m[32m    showToast[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m// Support Node.js CommonJS test environments if applicable[m
[32m+[m[32mif (typeof module !== 'undefined' && module.exports) {[m
[32m+[m[32m  module.exports = {[m
[32m+[m[32m    activeRequest,[m
[32m+[m[32m    ENVIRONMENTS,[m
[32m+[m[32m    getEnvironmentVariable,[m
[32m+[m[32m    resolveVariables,[m
[32m+[m[32m    prepareRequestUrl,[m
[32m+[m[32m    validateHeaders,[m
[32m+[m[32m    validateJsonBody,[m
[32m+[m[32m    beautifyJsonBody,[m
[32m+[m[32m    loadRequestIntoState[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
