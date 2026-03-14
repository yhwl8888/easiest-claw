; installer.nsh — EasiestClaw 自定义 NSIS 安装钩子
; 在安装/卸载时自动添加/删除 Windows Defender 防火墙规则，
; 避免用户首次启动时收到"是否允许连接网络"的拦截弹窗。

; 安装详情面板默认展开，用户无需手动点击 "Details" 按钮
!macro customHeader
  ShowInstDetails show
  ShowUnInstDetails show
!macroend

!macro customInstall
  ; electron-builder 在文件提取前设置了 SetDetailsPrint none，
  ; 这里重新打开，让后续 DetailPrint / ExecToLog 输出能显示在日志框中
  SetDetailsPrint both
  DetailPrint "文件解压完成，正在配置 Windows 防火墙规则..."
  DetailPrint "删除旧规则（如存在）..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="EasiestClaw"'
  DetailPrint "添加入站规则（TCP 18789）..."
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="EasiestClaw" dir=in action=allow program="$INSTDIR\EasiestClaw.exe" enable=yes'
  DetailPrint "防火墙规则配置完成。"
!macroend

; 卸载时跳过逐文件原子操作（openclaw node_modules 文件极多，会导致卸载极慢），
; 直接批量删除整个安装目录
!macro customRemoveFiles
  SetDetailsPrint none
  RMDir /r $INSTDIR
  SetDetailsPrint both
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "正在移除 Windows 防火墙规则..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="EasiestClaw"'
  DetailPrint "防火墙规则已移除。"
!macroend
