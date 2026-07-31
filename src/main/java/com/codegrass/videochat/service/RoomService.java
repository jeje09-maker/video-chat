package com.codegrass.videochat.service;

import com.codegrass.videochat.domain.RoomHistory;
import com.codegrass.videochat.domain.RoomHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class RoomService {

    private final RoomHistoryRepository roomHistoryRepository;

    public RoomHistory startRoom(String roomId, String creatorEmail) {
        RoomHistory history = new RoomHistory(roomId, creatorEmail);
        return roomHistoryRepository.save(history);
    }

    public void endRoom(RoomHistory history) {
        if (history != null) {
            history.setEndTime(LocalDateTime.now());
            long minutes = Duration.between(history.getStartTime(), history.getEndTime()).toMinutes();
            // Minimum 1 minute for statistics if it lasted less than a minute
            if (minutes == 0) {
                minutes = 1; 
            }
            history.setUsageMinutes(minutes);
            roomHistoryRepository.save(history);
            log.info("Room {} ended. Usage: {} minutes.", history.getRoomId(), minutes);
        }
    }
}
