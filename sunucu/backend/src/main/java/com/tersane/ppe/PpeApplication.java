package com.tersane.ppe;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PpeApplication {

	public static void main(String[] args) {
		SpringApplication.run(PpeApplication.class, args);
	}

}
