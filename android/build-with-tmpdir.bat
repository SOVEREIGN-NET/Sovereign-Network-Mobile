@echo off
REM Build script with forced java.io.tmpdir to fix SQLite JDBC on Windows
set JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=%USERPROFILE%\AppData\Local\Temp
call gradlew.bat app:installDebug -PreactNativeDevServerPort=8081 %*