package com.codegrass.videochat.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "room_history")
@Getter
@Setter
@NoArgsConstructor
public class RoomHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String roomId;

    private String creatorEmail; // Can be empty if not logged in

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private long usageMinutes;
    
    public RoomHistory(String roomId, String creatorEmail) {
        this.roomId = roomId;
        this.creatorEmail = creatorEmail;
        this.startTime = LocalDateTime.now();
    }
}
