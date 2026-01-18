import apiClient from "./client";

const base = "/logs";

export const fetchSystemLogs = async (lines = 300): Promise<string> => {
  const { data } = await apiClient.get(`${base}/system`, { params: { lines } });
  return data as string;
};

export const fetchTaskLogs = async (lines = 300): Promise<string> => {
  const { data } = await apiClient.get(`${base}/tasks`, { params: { lines } });
  return data as string;
};

export const downloadSystemLogs = () => {
  const token = localStorage.getItem("token");
  window.open(`${apiClient.defaults.baseURL}${base}/system/download?token=${token}`, "_blank");
};

export const downloadTaskLogs = () => {
  const token = localStorage.getItem("token");
  window.open(`${apiClient.defaults.baseURL}${base}/tasks/download?token=${token}`, "_blank");
};
