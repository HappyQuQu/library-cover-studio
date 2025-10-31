<template>
  <div class="logs-view">
    <div class="header">
      <h3>{{ t('logs.title') }}</h3>
      <div class="actions">
        <el-switch v-model="autoRefresh" :active-text="t('logs.autoRefresh')" />
        <el-select v-model="lineCount" size="small" style="width: 120px">
          <el-option v-for="n in lineOptions" :key="n" :label="`${n} ${t('logs.lines')}`" :value="n" />
        </el-select>
        <el-button size="small" @click="refresh">{{ t('common.refresh') }}</el-button>
        <el-button size="small" type="primary" @click="handleDownload">{{ t('common.export') }}</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-change="refresh">
      <el-tab-pane :label="t('logs.systemLogs')" name="system">
        <div ref="sysBox" class="log-box"><pre>{{ systemLogs }}</pre></div>
      </el-tab-pane>
      <el-tab-pane :label="t('logs.taskLogs')" name="tasks">
        <div ref="taskBox" class="log-box"><pre>{{ taskLogs }}</pre></div>
      </el-tab-pane>
    </el-tabs>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { fetchSystemLogs, fetchTaskLogs, downloadSystemLogs, downloadTaskLogs } from '../api/logs';
import { useLocale } from '../composables/useLocale';

const { t } = useLocale();

const activeTab = ref<'system' | 'tasks'>('system');
const systemLogs = ref('');
const taskLogs = ref('');
const autoRefresh = ref(true);
const lineCount = ref(500);
const lineOptions = [200, 500, 1000, 2000];

const sysBox = ref<HTMLDivElement>();
const taskBox = ref<HTMLDivElement>();
let timer: any = null;

async function loadLogs() {
  try {
    if (activeTab.value === 'system') {
      systemLogs.value = await fetchSystemLogs(lineCount.value);
      await nextTick();
      scrollToBottom(sysBox.value);
    } else {
      taskLogs.value = await fetchTaskLogs(lineCount.value);
      await nextTick();
      scrollToBottom(taskBox.value);
    }
  } catch (e) {
    // ignore transient errors
  }
}

function scrollToBottom(box?: HTMLDivElement) {
  if (!box) return;
  box.scrollTop = box.scrollHeight;
}

function refresh() {
  loadLogs();
}

function handleDownload() {
  if (activeTab.value === 'system') downloadSystemLogs();
  else downloadTaskLogs();
}

watch([activeTab, lineCount], () => {
  loadLogs();
});

watch(autoRefresh, (v) => {
  if (v) startTimer(); else stopTimer();
});

function startTimer() {
  stopTimer();
  timer = setInterval(loadLogs, 2000);
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

onMounted(() => {
  loadLogs();
  startTimer();
});

onUnmounted(() => stopTimer());
</script>

<style scoped>
.logs-view { padding: 20px; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.actions { display: flex; gap: 8px; align-items: center; }
.log-box { background: #0f172a; color: #e2e8f0; padding: 12px; height: 60vh; overflow: auto; border-radius: 8px; border: 1px solid #1e293b; }
pre { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
</style>
