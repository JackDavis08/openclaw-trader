@echo off
echo ============================================
echo    OpenClaw Trader - 停止自动交易
echo ============================================
echo.
echo 正在发送停止命令...
echo.
echo true > "C:\Users\DELL\openclaw-trader\stop-command.txt"
echo ✅ 停止命令已发送！
echo.
echo 交易机器人将在下一个扫描周期（最多15分钟）内：
echo   1. 平掉所有持仓
echo   2. 停止自动交易
echo.
echo 如需立即停止，请重启交易程序。
echo.
pause
