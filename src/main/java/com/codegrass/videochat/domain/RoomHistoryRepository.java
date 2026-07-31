package com.codegrass.videochat.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@Repository
public interface RoomHistoryRepository extends JpaRepository<RoomHistory, Long> {
    
    @Query("SELECT r.creatorEmail as email, COUNT(r) as count FROM RoomHistory r WHERE r.creatorEmail IS NOT NULL AND r.creatorEmail <> '' GROUP BY r.creatorEmail ORDER BY COUNT(r) DESC")
    List<Map<String, Object>> findTopCreators();
    
    @Query("SELECT SUM(r.usageMinutes) FROM RoomHistory r")
    Long getTotalUsageMinutes();
}
