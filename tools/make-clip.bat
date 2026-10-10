@echo off
rem Turns a screen recording into a small website clip (silent MP4, max 1280px wide, 24 fps, first 12 seconds).
rem Usage: drag a recording onto this file, or run:  make-clip.bat my-recording.mp4
rem Needs ffmpeg on your PATH (https://ffmpeg.org/download.html).
if "%~1"=="" (echo Drag a recording onto this file, or run: make-clip.bat my-recording.mp4 & pause & exit /b 1)
ffmpeg -y -i "%~1" -t 12 -an -vf "scale='min(1280,iw)':-2,fps=24" -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart "%~dpn1-clip.mp4"
echo.
echo Done: "%~dpn1-clip.mp4"  (upload it in Admin ^> Media; aim for 1-4 MB)
pause
