import axios from "axios";

const base = "/api/logs";

export const fetchSystemLogs = async (lines = 300): Promise<string> => {
  const { data } = await axios.get(`${base}/system`, { params: { lines } });
  return data as string;
};

export const fetchTaskLogs = async (lines = 300): Promise<string> => {
  const { data } = await axios.get(`${base}/tasks`, { params: { lines } });
  return data as string;
};

export const downloadSystemLogs = () => {
  window.open(`${base}/system/download`, "_blank");
};

export const downloadTaskLogs = () => {
  window.open(`${base}/tasks/download`, "_blank");
};
